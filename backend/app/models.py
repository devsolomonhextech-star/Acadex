from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class MembershipRole(StrEnum):
    SCHOOL_ADMIN = "school_admin"
    PRINCIPAL = "principal"
    TEACHER = "teacher"
    FINANCE = "finance"
    REGISTRAR = "registrar"
    PARENT = "parent"
    STUDENT = "student"
    STAFF = "staff"


class School(Base):
    __tablename__ = "schools"
    __table_args__ = (UniqueConstraint("slug", name="uq_schools_slug"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    memberships: Mapped[list["SchoolMembership"]] = relationship(back_populates="school")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    memberships: Mapped[list["SchoolMembership"]] = relationship(back_populates="user")


class SchoolMembership(Base):
    __tablename__ = "school_memberships"
    __table_args__ = (
        UniqueConstraint("school_id", "user_id", name="uq_memberships_school_user"),
        UniqueConstraint("school_id", "id", name="uq_memberships_school_id"),
        Index("ix_memberships_user_status", "user_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(Enum(MembershipRole, name="membership_role"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    school: Mapped[School] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    __table_args__ = (
        Index("ix_refresh_sessions_user_expiry", "user_id", "expires_at"),
        Index("ix_refresh_sessions_family", "family_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    family_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, default=uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_school_created", "school_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("school_id", "admission_number", name="uq_students_school_admission"),
        UniqueConstraint("school_id", "id", name="uq_students_school_id"),
        Index("ix_students_school_status_name", "school_id", "status", "last_name", "first_name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    admission_number: Mapped[str] = mapped_column(String(40), nullable=False)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademicYear(Base):
    __tablename__ = "academic_years"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_academic_years_school_name"),
        UniqueConstraint("school_id", "id", name="uq_academic_years_school_id"),
        CheckConstraint("starts_on <= ends_on", name="ck_academic_years_dates"),
        Index("ix_academic_years_school_dates", "school_id", "starts_on"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned", server_default="planned")


class AcademicTerm(Base):
    __tablename__ = "academic_terms"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "academic_year_id", "ordinal", name="uq_terms_year_ordinal"),
        UniqueConstraint("school_id", "academic_year_id", "name", name="uq_terms_year_name"),
        UniqueConstraint("school_id", "academic_year_id", "id", name="uq_terms_school_year_id"),
        CheckConstraint("starts_on <= ends_on", name="ck_terms_dates"),
        Index("ix_terms_school_year", "school_id", "academic_year_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    ordinal: Mapped[int] = mapped_column(nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)


class ClassGroup(Base):
    __tablename__ = "class_groups"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_class_groups_school_id"),
        UniqueConstraint("school_id", "academic_year_id", "id", name="uq_class_groups_school_year_id"),
        UniqueConstraint("school_id", "academic_year_id", "name", "stream", name="uq_class_groups_year_name_stream"),
        Index("ix_class_groups_school_year", "school_id", "academic_year_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    grade_level: Mapped[str] = mapped_column(String(40), nullable=False)
    stream: Mapped[str] = mapped_column(String(40), nullable=False, default="", server_default="")


class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        UniqueConstraint("student_id", "academic_year_id", name="uq_enrollments_student_year"),
        Index("ix_enrollments_school_class", "school_id", "class_group_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    enrolled_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")


class SchoolInvitation(Base):
    __tablename__ = "school_invitations"
    __table_args__ = (
        ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        Index("ix_invitations_school_email_status", "school_id", "email", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(Enum(MembershipRole, name="membership_role"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Subject(Base):
    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_subjects_school_code"),
        UniqueConstraint("school_id", "id", name="uq_subjects_school_id"),
        ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        Index("ix_subjects_school_name", "school_id", "name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    code: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")


class ClassSubjectAssignment(Base):
    __tablename__ = "class_subject_assignments"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "teacher_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "class_group_id", "subject_id", "teacher_membership_id", name="uq_assignments_class_subject_teacher"),
        Index("ix_assignments_school_class", "school_id", "class_group_id"),
        Index("ix_assignments_teacher_class", "school_id", "teacher_membership_id", "class_group_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    teacher_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Python-side onupdate keeps async attribute reads safe: a SQL-side onupdate() would
# expire the column on every flush, and re-reading it from sync context raises MissingGreenlet.

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "recorded_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "class_group_id", "attendance_date", name="uq_attendance_class_date"),
        UniqueConstraint("school_id", "id", name="uq_attendance_sessions_school_id"),
        Index("ix_attendance_school_date", "school_id", "attendance_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "session_id"], ["attendance_sessions.school_id", "attendance_sessions.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "session_id", "student_id", name="uq_attendance_record_student"),
        CheckConstraint("status IN ('present', 'absent', 'late', 'excused')", name="ck_attendance_record_status"),
        Index("ix_attendance_records_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    session_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(String(240))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class GradingScale(Base):
    __tablename__ = "grading_scales"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_grading_scales_school_name"),
        UniqueConstraint("school_id", "id", name="uq_grading_scales_school_id"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_grading_scales_status"),
        Index("ix_grading_scales_school_status", "school_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_default: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    include_positions: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)
    bands: Mapped[list["GradingBand"]] = relationship(back_populates="scale", order_by="GradingBand.min_percent", cascade="all, delete-orphan")


class GradingBand(Base):
    __tablename__ = "grading_bands"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "scale_id"], ["grading_scales.school_id", "grading_scales.id"], ondelete="CASCADE"),
        UniqueConstraint("school_id", "id", name="uq_grading_bands_school_id"),
        UniqueConstraint("scale_id", "min_percent", name="uq_grading_bands_scale_min"),
        CheckConstraint("min_percent >= 0 AND max_percent <= 100 AND min_percent <= max_percent", name="ck_grading_bands_range"),
        Index("ix_grading_bands_scale", "school_id", "scale_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    scale_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    min_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    max_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    grade: Mapped[str] = mapped_column(String(12), nullable=False)
    points: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    description: Mapped[str | None] = mapped_column(String(80))
    scale: Mapped[GradingScale] = relationship(back_populates="bands")


class TermSubjectResult(Base):
    """Weighted term total for one student, class, subject, and term.

    Recomputed while the class/term is unpublished; frozen once its publication is published.
    """

    __tablename__ = "term_subject_results"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "term_id", "class_group_id", "subject_id", "student_id", name="uq_term_subject_results_row"),
        CheckConstraint("weighted_total >= 0 AND weighted_total <= 100", name="ck_term_subject_results_total"),
        CheckConstraint("total_weight >= 0", name="ck_term_subject_results_weight"),
        Index("ix_term_subject_results_school_class_term", "school_id", "class_group_id", "term_id"),
        Index("ix_term_subject_results_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    weighted_total: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(12))
    points: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    assessment_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    total_weight: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False, default=Decimal(0), server_default="0")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TermResult(Base):
    """Per-student term aggregate (mean of subject totals) with optional class position."""

    __tablename__ = "term_results"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "term_id", "class_group_id", "student_id", name="uq_term_results_row"),
        CheckConstraint("aggregate_percent >= 0 AND aggregate_percent <= 100", name="ck_term_results_aggregate"),
        CheckConstraint("position IS NULL OR position >= 1", name="ck_term_results_position"),
        Index("ix_term_results_school_class_term", "school_id", "class_group_id", "term_id"),
        Index("ix_term_results_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    aggregate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(12))
    points: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    position: Mapped[int | None] = mapped_column(nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResultPublication(Base):
    """Publication state for one class and term; published rows lock recomputation."""

    __tablename__ = "result_publications"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "grading_scale_id"], ["grading_scales.school_id", "grading_scales.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "term_id", "class_group_id", name="uq_result_publications_row"),
        CheckConstraint("status IN ('draft', 'published', 'withdrawn')", name="ck_result_publications_status"),
        Index("ix_result_publications_school_class_term", "school_id", "class_group_id", "term_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    grading_scale_id: Mapped[UUID | None] = mapped_column(Uuid)
    published_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("school_memberships.id", ondelete="RESTRICT"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawn_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("school_memberships.id", ondelete="RESTRICT"))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "created_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "reviewed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_assessments_school_id"),
        UniqueConstraint("school_id", "class_group_id", "subject_id", "term_id", "title", name="uq_assessments_class_subject_term_title"),
        CheckConstraint("max_score > 0 AND max_score <= 1000", name="ck_assessments_positive_max_score"),
        CheckConstraint("category IN ('quiz', 'assignment', 'project', 'class_test', 'examination', 'practical', 'other')", name="ck_assessments_category"),
        CheckConstraint("weight_percent >= 0 AND weight_percent <= 100", name="ck_assessments_weight_range"),
        CheckConstraint("status IN ('open', 'submitted', 'returned', 'approved')", name="ck_assessments_status"),
        Index("ix_assessments_school_class_term", "school_id", "class_group_id", "term_id"),
        Index("ix_assessments_school_status", "school_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    max_score: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    weight_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal(0), server_default="0")
    due_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    review_note: Mapped[str | None] = mapped_column(String(1000))
    created_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    reviewed_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class AssessmentScore(Base):
    __tablename__ = "assessment_scores"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "assessment_id"], ["assessments.school_id", "assessments.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "updated_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "assessment_id", "student_id", name="uq_assessment_score_student"),
        CheckConstraint("score IS NULL OR score >= 0", name="ck_assessment_scores_nonnegative"),
        Index("ix_assessment_scores_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    assessment_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    comment: Mapped[str | None] = mapped_column(String(240))
    updated_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class StudentImportJob(Base):
    """A validated import preview; students are only created when it is confirmed."""

    __tablename__ = "student_import_jobs"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_student_import_jobs_school_id"),
        CheckConstraint(
            "status IN ('previewed', 'confirmed')", name="ck_student_import_jobs_status"
        ),
        CheckConstraint(
            "total_rows >= 0 AND valid_rows >= 0 AND error_rows >= 0 AND duplicate_rows >= 0"
            " AND created_rows >= 0 AND skipped_rows >= 0",
            name="ck_student_import_jobs_counts",
        ),
        Index("ix_student_import_jobs_school_created", "school_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="previewed", server_default="previewed")
    # Uploaded header -> canonical field, as used for this preview.
    column_map: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    # Parsed rows with per-row status (valid/error/duplicate/created/skipped) and messages.
    preview_rows: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    total_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    valid_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    error_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    duplicate_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    created_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    skipped_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

