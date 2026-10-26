"""Timed, school-scoped online exams and printable exam content."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.assessments import _has_assignment, _membership_id
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    Assessment, AssessmentScore, AuditEvent, ClassGroup, ExamAnswer, ExamAttempt,
    ExamOption, ExamQuestion, MembershipRole, OnlineExam, Student, StudentEnrollment,
)

router = APIRouter(prefix="/api/v1/exams", tags=["exams"])
TEACHER_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER)


class OptionInput(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    correct: bool = False


class QuestionInput(BaseModel):
    text: str = Field(min_length=3, max_length=4000)
    type: Literal["multiple_choice", "written"]
    points: Decimal = Field(gt=0, le=1000, max_digits=7, decimal_places=2)
    options: list[OptionInput] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_options(self):
        if self.type == "multiple_choice":
            if len(self.options) < 2 or sum(option.correct for option in self.options) != 1:
                raise ValueError("Multiple-choice questions need at least two options and exactly one correct answer")
        elif self.options:
            raise ValueError("Written questions cannot have answer options")
        return self


class ExamSetup(BaseModel):
    duration_minutes: int = Field(ge=1, le=480)
    instructions: str | None = Field(default=None, max_length=3000)
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    questions: list[QuestionInput] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_window_and_total(self):
        if any(value is not None and value.tzinfo is None for value in (self.opens_at, self.closes_at)):
            raise ValueError("Exam opening and closing times must include a timezone")
        if self.opens_at and self.closes_at and self.closes_at <= self.opens_at:
            raise ValueError("Exam close time must be after the open time")
        if sum((question.points for question in self.questions), Decimal(0)) <= 0:
            raise ValueError("Exam must have a positive total score")
        return self


class ExamAnswerInput(BaseModel):
    question_id: UUID
    selected_option_id: UUID | None = None
    written_answer: str | None = Field(default=None, max_length=12000)


class ExamSubmit(BaseModel):
    answers: list[ExamAnswerInput] = Field(max_length=100)


class MarkInput(BaseModel):
    question_id: UUID
    points_awarded: Decimal = Field(ge=0, max_digits=7, decimal_places=2)
    feedback: str | None = Field(default=None, max_length=1000)


class ExamReview(BaseModel):
    marks: list[MarkInput] = Field(default_factory=list, max_length=100)


def _now() -> datetime:
    return datetime.now(UTC)


async def _teacher_exam(session: AsyncSession, context: TenantContext, assessment_id: UUID, *, editing: bool = False):
    assessment = await session.scalar(select(Assessment).where(
        Assessment.id == assessment_id, Assessment.school_id == context.school_id,
    ))
    if assessment is None:
        raise HTTPException(404, "Assessment not found")
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        if not await _has_assignment(session, context.school_id, member_id, assessment.class_group_id, assessment.subject_id):
            raise HTTPException(403, "You are not assigned to this class and subject")
    exam = await session.scalar(select(OnlineExam).where(
        OnlineExam.school_id == context.school_id, OnlineExam.assessment_id == assessment.id,
    ))
    if editing and exam and exam.published_at:
        raise HTTPException(409, "Unpublish the exam before editing it")
    return assessment, exam


async def _questions(session: AsyncSession, school_id: UUID, exam_id: UUID):
    questions = list((await session.scalars(select(ExamQuestion).where(
        ExamQuestion.school_id == school_id, ExamQuestion.exam_id == exam_id,
    ).order_by(ExamQuestion.position))).all())
    return questions


async def _question_rows(session: AsyncSession, school_id: UUID, exam_id: UUID, *, include_key: bool):
    result = []
    for question in await _questions(session, school_id, exam_id):
        options = list((await session.scalars(select(ExamOption).where(
            ExamOption.school_id == school_id, ExamOption.question_id == question.id,
        ).order_by(ExamOption.position))).all())
        result.append({
            "id": question.id, "position": question.position, "text": question.question_text,
            "type": question.question_type, "points": question.points,
            "options": [{"id": option.id, "text": option.option_text, **({"correct": option.is_correct} if include_key else {})} for option in options],
        })
    return result


async def _exam_summary(session: AsyncSession, assessment: Assessment, exam: OnlineExam, *, include_key: bool):
    class_group = await session.scalar(select(ClassGroup).where(
        ClassGroup.school_id == assessment.school_id, ClassGroup.id == assessment.class_group_id,
    ))
    return {
        "id": exam.id, "assessment_id": assessment.id, "title": assessment.title,
        "class_group_id": assessment.class_group_id, "class_name": class_group.name if class_group else "",
        "subject_id": assessment.subject_id, "term_id": assessment.term_id,
        "duration_minutes": exam.duration_minutes, "instructions": exam.instructions,
        "opens_at": exam.opens_at, "closes_at": exam.closes_at, "published": exam.published_at is not None,
        "questions": await _question_rows(session, assessment.school_id, exam.id, include_key=include_key),
    }


@router.put("/assessment/{assessment_id}")
async def save_exam(assessment_id: UUID, payload: ExamSetup,
                    context: Annotated[TenantContext, Depends(require_roles(*TEACHER_ROLES))],
                    session: Annotated[AsyncSession, Depends(get_session)]):
    assessment, exam = await _teacher_exam(session, context, assessment_id, editing=True)
    if assessment.category != "examination":
        raise HTTPException(422, "Create an examination assessment before configuring its exam")
    if exam and await session.scalar(select(ExamAttempt.id).where(
        ExamAttempt.school_id == context.school_id, ExamAttempt.exam_id == exam.id,
    ).limit(1)):
        raise HTTPException(409, "An exam cannot be edited after a student has started a sitting")
    if sum((question.points for question in payload.questions), Decimal(0)) != assessment.max_score:
        raise HTTPException(422, f"Question points must total the assessment maximum of {assessment.max_score}")
    if exam is None:
        exam = OnlineExam(id=uuid4(), school_id=context.school_id, assessment_id=assessment.id,
                          duration_minutes=payload.duration_minutes, instructions=payload.instructions,
                          opens_at=payload.opens_at, closes_at=payload.closes_at)
        session.add(exam)
        await session.flush()
    else:
        exam.duration_minutes = payload.duration_minutes
        exam.instructions = payload.instructions
        exam.opens_at = payload.opens_at
        exam.closes_at = payload.closes_at
        await session.execute(ExamQuestion.__table__.delete().where(
            ExamQuestion.school_id == context.school_id, ExamQuestion.exam_id == exam.id,
        ))
    for index, question_input in enumerate(payload.questions, 1):
        question = ExamQuestion(id=uuid4(), school_id=context.school_id, exam_id=exam.id,
                                position=index, question_text=question_input.text.strip(),
                                question_type=question_input.type, points=question_input.points)
        session.add(question)
        await session.flush()
        for option_index, option_input in enumerate(question_input.options, 1):
            session.add(ExamOption(id=uuid4(), school_id=context.school_id, question_id=question.id,
                                   position=option_index, option_text=option_input.text.strip(), is_correct=option_input.correct))
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="exam.saved", resource_type="exam", resource_id=exam.id))
    await session.commit()
    return await _exam_summary(session, assessment, exam, include_key=True)


@router.get("/assessment/{assessment_id}")
async def get_exam(assessment_id: UUID,
                   context: Annotated[TenantContext, Depends(require_roles(*TEACHER_ROLES))],
                   session: Annotated[AsyncSession, Depends(get_session)]):
    assessment, exam = await _teacher_exam(session, context, assessment_id)
    if exam is None:
        raise HTTPException(404, "This assessment does not have an online exam yet")
    return await _exam_summary(session, assessment, exam, include_key=True)


@router.post("/assessment/{assessment_id}/publish")
async def publish_exam(assessment_id: UUID,
                       context: Annotated[TenantContext, Depends(require_roles(*TEACHER_ROLES))],
                       session: Annotated[AsyncSession, Depends(get_session)]):
    assessment, exam = await _teacher_exam(session, context, assessment_id)
    if exam is None or not await _questions(session, context.school_id, exam.id):
        raise HTTPException(409, "Add exam questions before publishing")
    if exam.published_at and await session.scalar(select(ExamAttempt.id).where(
        ExamAttempt.school_id == context.school_id, ExamAttempt.exam_id == exam.id,
    ).limit(1)):
        raise HTTPException(409, "This exam cannot be unpublished after a student has started a sitting")
    exam.published_at = _now() if exam.published_at is None else None
    await session.commit()
    return {"published": exam.published_at is not None}


@router.get("/student/available")
async def available_exams(context: Annotated[TenantContext, Depends(require_roles(MembershipRole.STUDENT))],
                          session: Annotated[AsyncSession, Depends(get_session)]):
    student = await session.scalar(select(Student).where(
        Student.school_id == context.school_id, Student.user_id == context.user_id, Student.status == "active",
    ))
    if student is None:
        raise HTTPException(403, "Student account is not linked to an active student profile")
    now = _now()
    rows = (await session.execute(
        select(OnlineExam, Assessment, ExamAttempt)
        .join(Assessment, (Assessment.id == OnlineExam.assessment_id) & (Assessment.school_id == OnlineExam.school_id))
        .join(StudentEnrollment, (StudentEnrollment.school_id == Assessment.school_id)
              & (StudentEnrollment.academic_year_id == Assessment.academic_year_id)
              & (StudentEnrollment.class_group_id == Assessment.class_group_id))
        .outerjoin(ExamAttempt, (ExamAttempt.school_id == OnlineExam.school_id)
                   & (ExamAttempt.exam_id == OnlineExam.id) & (ExamAttempt.student_id == student.id))
        .where(OnlineExam.school_id == context.school_id, OnlineExam.published_at.is_not(None),
               StudentEnrollment.student_id == student.id, StudentEnrollment.status == "active",
               or_(OnlineExam.opens_at.is_(None), OnlineExam.opens_at <= now, ExamAttempt.status.in_(("in_progress", "submitted", "reviewed"))),
               or_(OnlineExam.closes_at.is_(None), OnlineExam.closes_at >= now, ExamAttempt.status.in_(("in_progress", "submitted", "reviewed"))))
        .order_by(OnlineExam.opens_at, Assessment.due_on)
    )).all()
    return [{"id": exam.id, "assessment_id": assessment.id, "title": assessment.title,
             "subject_id": assessment.subject_id, "duration_minutes": exam.duration_minutes,
             "instructions": exam.instructions, "opens_at": exam.opens_at, "closes_at": exam.closes_at,
             "attempt_status": attempt.status if attempt else "not_started",
             "score": attempt.score if attempt and attempt.status == "reviewed" else None,
             "deadline_at": attempt.deadline_at if attempt else None}
            for exam, assessment, attempt in rows]


async def _student_exam_context(session: AsyncSession, context: TenantContext, exam_id: UUID):
    student = await session.scalar(select(Student).where(
        Student.school_id == context.school_id, Student.user_id == context.user_id, Student.status == "active",
    ))
    exam = await session.scalar(select(OnlineExam).where(
        OnlineExam.id == exam_id, OnlineExam.school_id == context.school_id,
        OnlineExam.published_at.is_not(None),
    ))
    if student is None or exam is None:
        raise HTTPException(404, "Exam not found")
    assessment = await session.scalar(select(Assessment).where(
        Assessment.id == exam.assessment_id, Assessment.school_id == context.school_id,
    ))
    if assessment is None:
        raise HTTPException(404, "Exam not found")
    enrolled = await session.scalar(select(StudentEnrollment.id).where(
        StudentEnrollment.school_id == context.school_id, StudentEnrollment.student_id == student.id,
        StudentEnrollment.class_group_id == assessment.class_group_id,
        StudentEnrollment.academic_year_id == assessment.academic_year_id, StudentEnrollment.status == "active",
    ))
    if enrolled is None:
        raise HTTPException(403, "You are not enrolled in this exam class")
    return student, exam, assessment


@router.post("/student/{exam_id}/start")
async def start_exam(exam_id: UUID,
                     context: Annotated[TenantContext, Depends(require_roles(MembershipRole.STUDENT))],
                     session: Annotated[AsyncSession, Depends(get_session)]):
    student, exam, _assessment = await _student_exam_context(session, context, exam_id)
    now = _now()
    attempt = await session.scalar(select(ExamAttempt).where(
        ExamAttempt.school_id == context.school_id, ExamAttempt.exam_id == exam.id, ExamAttempt.student_id == student.id,
    ).with_for_update())
    if attempt is None and exam.opens_at and now < exam.opens_at:
        raise HTTPException(409, "This exam has not opened yet")
    if attempt is None and exam.closes_at and now >= exam.closes_at:
        raise HTTPException(409, "The exam sitting window has closed")
    if attempt is None:
        attempt = ExamAttempt(id=uuid4(), school_id=context.school_id, exam_id=exam.id, student_id=student.id,
                              status="in_progress", started_at=now,
                              deadline_at=min(now + timedelta(minutes=exam.duration_minutes), exam.closes_at) if exam.closes_at else now + timedelta(minutes=exam.duration_minutes))
        session.add(attempt)
        await session.commit()
    if attempt.status != "in_progress":
        raise HTTPException(409, "You have already submitted this exam")
    return {"attempt_id": attempt.id, "deadline_at": attempt.deadline_at,
            "exam": await _exam_summary(session, _assessment, exam, include_key=False)}


@router.put("/student/attempt/{attempt_id}/answers")
async def save_exam_answers(attempt_id: UUID, payload: ExamSubmit,
                            context: Annotated[TenantContext, Depends(require_roles(MembershipRole.STUDENT))],
                            session: Annotated[AsyncSession, Depends(get_session)]):
    attempt = await session.scalar(select(ExamAttempt).where(
        ExamAttempt.id == attempt_id, ExamAttempt.school_id == context.school_id,
    ).with_for_update())
    student = await session.scalar(select(Student).where(
        Student.school_id == context.school_id, Student.user_id == context.user_id,
    ))
    if attempt is None or student is None or attempt.student_id != student.id or attempt.status != "in_progress":
        raise HTTPException(404, "Active exam attempt not found")
    if _now() >= attempt.deadline_at:
        raise HTTPException(409, "The exam time has ended")
    questions = {question.id: question for question in await _questions(session, context.school_id, attempt.exam_id)}
    if len({item.question_id for item in payload.answers}) != len(payload.answers) or any(item.question_id not in questions for item in payload.answers):
        raise HTTPException(422, "Answers contain duplicate or invalid questions")
    for item in payload.answers:
        question = questions[item.question_id]
        if question.question_type == "written" and item.selected_option_id is not None:
            raise HTTPException(422, "Written questions accept a text response only")
        if question.question_type == "multiple_choice" and item.written_answer:
            raise HTTPException(422, "Multiple-choice questions accept an option only")
        if question.question_type == "multiple_choice" and item.selected_option_id:
            option = await session.scalar(select(ExamOption.id).where(
                ExamOption.id == item.selected_option_id, ExamOption.school_id == context.school_id,
                ExamOption.question_id == question.id,
            ))
            if option is None:
                raise HTTPException(422, "An answer option does not belong to its question")
        existing = await session.scalar(select(ExamAnswer).where(
            ExamAnswer.school_id == context.school_id, ExamAnswer.attempt_id == attempt.id,
            ExamAnswer.question_id == question.id,
        ))
        if existing is None:
            existing = ExamAnswer(id=uuid4(), school_id=context.school_id, attempt_id=attempt.id, question_id=question.id)
            session.add(existing)
        existing.selected_option_id = item.selected_option_id
        existing.written_answer = item.written_answer.strip() if item.written_answer else None
    await session.commit()
    return {"saved": True}


@router.get("/student/attempt/{attempt_id}")
async def get_student_attempt(attempt_id: UUID,
                              context: Annotated[TenantContext, Depends(require_roles(MembershipRole.STUDENT))],
                              session: Annotated[AsyncSession, Depends(get_session)]):
    attempt = await session.scalar(select(ExamAttempt).where(
        ExamAttempt.id == attempt_id, ExamAttempt.school_id == context.school_id,
    ))
    student = await session.scalar(select(Student).where(
        Student.school_id == context.school_id, Student.user_id == context.user_id,
    ))
    if attempt is None or student is None or attempt.student_id != student.id:
        raise HTTPException(404, "Exam attempt not found")
    exam = await session.get(OnlineExam, attempt.exam_id)
    if exam is None:
        raise HTTPException(404, "Exam not found")
    assessment = await session.scalar(select(Assessment).where(
        Assessment.id == exam.assessment_id, Assessment.school_id == context.school_id,
    ))
    if assessment is None:
        raise HTTPException(404, "Exam not found")
    answer_rows = list((await session.scalars(select(ExamAnswer).where(
        ExamAnswer.school_id == context.school_id, ExamAnswer.attempt_id == attempt.id,
    ))).all())
    return {"attempt_id": attempt.id, "deadline_at": attempt.deadline_at, "status": attempt.status,
            "exam": await _exam_summary(session, assessment, exam, include_key=False),
            "answers": [{"question_id": row.question_id, "selected_option_id": row.selected_option_id,
                         "written_answer": row.written_answer} for row in answer_rows]}


@router.post("/student/attempt/{attempt_id}/submit")
async def submit_exam(attempt_id: UUID, payload: ExamSubmit,
                      context: Annotated[TenantContext, Depends(require_roles(MembershipRole.STUDENT))],
                      session: Annotated[AsyncSession, Depends(get_session)]):
    attempt = await session.scalar(select(ExamAttempt).where(
        ExamAttempt.id == attempt_id, ExamAttempt.school_id == context.school_id,
    ).with_for_update())
    student = await session.scalar(select(Student).where(
        Student.school_id == context.school_id, Student.user_id == context.user_id,
    ))
    if attempt is None or student is None or attempt.student_id != student.id:
        raise HTTPException(404, "Exam attempt not found")
    if attempt.status != "in_progress":
        raise HTTPException(409, "This exam has already been submitted")
    expired = _now() >= attempt.deadline_at
    questions = await _questions(session, context.school_id, attempt.exam_id)
    question_map = {question.id: question for question in questions}
    existing = list((await session.scalars(select(ExamAnswer).where(
        ExamAnswer.school_id == context.school_id, ExamAnswer.attempt_id == attempt.id,
    ))).all())
    if expired:
        # The browser clock is only a convenience. Once the server deadline has
        # passed, finalize only server-saved draft answers; ignore late payloads.
        answer_map = {answer.question_id: ExamAnswerInput(
            question_id=answer.question_id, selected_option_id=answer.selected_option_id,
            written_answer=answer.written_answer,
        ) for answer in existing}
    else:
        answer_map = {answer.question_id: answer for answer in payload.answers}
    if len(answer_map) > len(question_map) or set(answer_map) - set(question_map):
        raise HTTPException(422, "Answers contain duplicate or invalid questions")
    if not expired and len(answer_map) != len(payload.answers):
        raise HTTPException(422, "Answers contain duplicate or invalid questions")
    existing_by_question = {answer.question_id: answer for answer in existing}
    mcq_score = Decimal(0)
    needs_review = False
    for question in questions:
        answer = answer_map.get(question.id)
        selected_option_id = answer.selected_option_id if answer else None
        written_answer = answer.written_answer.strip() if answer and answer.written_answer else None
        if question.question_type == "written" and selected_option_id is not None:
            raise HTTPException(422, "Written questions accept a text response only")
        if question.question_type == "multiple_choice" and written_answer:
            raise HTTPException(422, "Multiple-choice questions accept an option only")
        awarded = None
        if question.question_type == "multiple_choice":
            option = await session.scalar(select(ExamOption).where(
                ExamOption.id == selected_option_id, ExamOption.school_id == context.school_id,
                ExamOption.question_id == question.id,
            )) if selected_option_id else None
            if selected_option_id and option is None:
                raise HTTPException(422, "An answer option does not belong to its question")
            correct = await session.scalar(select(ExamOption.id).where(
                ExamOption.school_id == context.school_id, ExamOption.question_id == question.id, ExamOption.is_correct.is_(True),
            ))
            awarded = question.points if selected_option_id and selected_option_id == correct else Decimal(0)
            mcq_score += awarded
        else:
            needs_review = True
        record = existing_by_question.get(question.id)
        if record is None:
            record = ExamAnswer(id=uuid4(), school_id=context.school_id, attempt_id=attempt.id, question_id=question.id)
            session.add(record)
        record.selected_option_id = selected_option_id
        record.written_answer = written_answer
        record.points_awarded = awarded
    now = _now()
    attempt.status = "submitted"
    attempt.submitted_at = min(now, attempt.deadline_at)
    attempt.score = None if needs_review else mcq_score
    await session.commit()
    return {"status": attempt.status, "score": attempt.score, "awaiting_teacher_review": True}


@router.get("/assessment/{assessment_id}/attempts")
async def exam_attempts(assessment_id: UUID,
                       context: Annotated[TenantContext, Depends(require_roles(*TEACHER_ROLES))],
                       session: Annotated[AsyncSession, Depends(get_session)]):
    assessment, exam = await _teacher_exam(session, context, assessment_id)
    if exam is None:
        raise HTTPException(404, "Online exam not found")
    attempts = list((await session.scalars(select(ExamAttempt).where(
        ExamAttempt.school_id == context.school_id, ExamAttempt.exam_id == exam.id,
    ).order_by(ExamAttempt.started_at.desc()))).all())
    response = []
    for attempt in attempts:
        student = await session.get(Student, attempt.student_id)
        answers = list((await session.scalars(select(ExamAnswer).where(
            ExamAnswer.school_id == context.school_id, ExamAnswer.attempt_id == attempt.id,
        ))).all())
        details = []
        for answer in answers:
            question = await session.get(ExamQuestion, answer.question_id)
            selected = await session.get(ExamOption, answer.selected_option_id) if answer.selected_option_id else None
            details.append({"question_id": question.id, "question": question.question_text,
                            "type": question.question_type, "max_points": question.points,
                            "written_answer": answer.written_answer,
                            "selected_option": selected.option_text if selected else None,
                            "points_awarded": answer.points_awarded, "feedback": answer.teacher_feedback})
        response.append({"id": attempt.id, "student_id": attempt.student_id,
                         "student_name": f"{student.first_name} {student.last_name}" if student else "Student",
                         "admission_number": student.admission_number if student else "",
                         "status": attempt.status, "started_at": attempt.started_at,
                         "submitted_at": attempt.submitted_at, "score": attempt.score, "answers": details})
    return {"assessment_id": assessment.id, "exam_id": exam.id, "attempts": response}


@router.post("/attempt/{attempt_id}/review")
async def review_exam_attempt(attempt_id: UUID, payload: ExamReview,
                              context: Annotated[TenantContext, Depends(require_roles(*TEACHER_ROLES))],
                              session: Annotated[AsyncSession, Depends(get_session)]):
    attempt = await session.scalar(select(ExamAttempt).where(
        ExamAttempt.id == attempt_id, ExamAttempt.school_id == context.school_id,
    ).with_for_update())
    if attempt is None:
        raise HTTPException(404, "Exam attempt not found")
    exam = await session.get(OnlineExam, attempt.exam_id)
    assessment, _ = await _teacher_exam(session, context, exam.assessment_id)
    if attempt.status != "submitted":
        raise HTTPException(409, "Only submitted exams can be marked")
    membership_id = await _membership_id(session, context)
    questions = {question.id: question for question in await _questions(session, context.school_id, exam.id)}
    answers = list((await session.scalars(select(ExamAnswer).where(
        ExamAnswer.school_id == context.school_id, ExamAnswer.attempt_id == attempt.id,
    ))).all())
    answer_by_question = {answer.question_id: answer for answer in answers}
    marks = {mark.question_id: mark for mark in payload.marks}
    for question_id, mark in marks.items():
        question = questions.get(question_id)
        answer = answer_by_question.get(question_id)
        if question is None or answer is None or question.question_type != "written":
            raise HTTPException(422, "Only answered written questions can be marked")
        if mark.points_awarded > question.points:
            raise HTTPException(422, f"A score cannot exceed {question.points}")
        answer.points_awarded = mark.points_awarded
        answer.teacher_feedback = mark.feedback.strip() if mark.feedback else None
    written = [question for question in questions.values() if question.question_type == "written"]
    if any(answer_by_question.get(question.id) is None or answer_by_question[question.id].points_awarded is None for question in written):
        raise HTTPException(422, "Mark every written answer before finalizing the exam")
    attempt.score = sum((answer.points_awarded or Decimal(0) for answer in answers), Decimal(0))
    attempt.status = "reviewed"
    attempt.reviewed_by_membership_id = membership_id
    attempt.reviewed_at = _now()
    grade = await session.scalar(select(AssessmentScore).where(
        AssessmentScore.school_id == context.school_id, AssessmentScore.assessment_id == assessment.id,
        AssessmentScore.student_id == attempt.student_id,
    ))
    if grade is None:
        grade = AssessmentScore(id=uuid4(), school_id=context.school_id, assessment_id=assessment.id,
                                student_id=attempt.student_id, updated_by_membership_id=membership_id)
        session.add(grade)
    grade.score = attempt.score
    grade.comment = "Online exam marked"
    grade.submission_status = "submitted"
    grade.updated_by_membership_id = membership_id
    await session.commit()
    return {"status": attempt.status, "score": attempt.score}
