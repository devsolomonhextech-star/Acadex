"""Add timed online exams, question banks, and student attempts."""
import sqlalchemy as sa
from alembic import op

revision = "0019_online_exams"
down_revision = "0018_class_teachers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "online_exams",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False), sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("instructions", sa.Text()), sa.Column("opens_at", sa.DateTime(timezone=True)),
        sa.Column("closes_at", sa.DateTime(timezone=True)), sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "assessment_id"], ["assessments.school_id", "assessments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_online_exams_school_id"),
        sa.UniqueConstraint("school_id", "assessment_id", name="uq_online_exams_assessment"),
        sa.CheckConstraint("duration_minutes BETWEEN 1 AND 480", name="ck_online_exams_duration"),
    )
    op.create_index("ix_online_exams_school_published", "online_exams", ["school_id", "published_at"])
    op.create_table(
        "exam_questions",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=False), sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False), sa.Column("question_type", sa.String(24), nullable=False),
        sa.Column("points", sa.Numeric(7, 2), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "exam_id"], ["online_exams.school_id", "online_exams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_exam_questions_school_id"),
        sa.UniqueConstraint("school_id", "exam_id", "position", name="uq_exam_questions_position"),
        sa.CheckConstraint("question_type IN ('multiple_choice', 'written')", name="ck_exam_questions_type"),
        sa.CheckConstraint("points > 0", name="ck_exam_questions_points"),
    )
    op.create_index("ix_exam_questions_exam", "exam_questions", ["school_id", "exam_id", "position"])
    op.create_table(
        "exam_options",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False), sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("option_text", sa.Text(), nullable=False), sa.Column("is_correct", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "question_id"], ["exam_questions.school_id", "exam_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_exam_options_school_id"),
        sa.UniqueConstraint("school_id", "question_id", "position", name="uq_exam_options_position"),
    )
    op.create_index("ix_exam_options_question", "exam_options", ["school_id", "question_id", "position"])
    op.create_table(
        "exam_attempts",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=False), sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), server_default="in_progress", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False), sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True)), sa.Column("score", sa.Numeric(7, 2)),
        sa.Column("reviewed_by_membership_id", sa.Uuid()), sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "exam_id"], ["online_exams.school_id", "online_exams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "reviewed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_exam_attempts_school_id"),
        sa.UniqueConstraint("school_id", "exam_id", "student_id", name="uq_exam_attempt_student"),
        sa.CheckConstraint("status IN ('in_progress', 'submitted', 'reviewed')", name="ck_exam_attempt_status"),
    )
    op.create_index("ix_exam_attempts_school_exam_status", "exam_attempts", ["school_id", "exam_id", "status"])
    op.create_table(
        "exam_answers",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False), sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("selected_option_id", sa.Uuid()), sa.Column("written_answer", sa.Text()),
        sa.Column("points_awarded", sa.Numeric(7, 2)), sa.Column("teacher_feedback", sa.String(1000)),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "attempt_id"], ["exam_attempts.school_id", "exam_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id", "question_id"], ["exam_questions.school_id", "exam_questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id", "selected_option_id"], ["exam_options.school_id", "exam_options.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "attempt_id", "question_id", name="uq_exam_answers_question"),
        sa.CheckConstraint("points_awarded IS NULL OR points_awarded >= 0", name="ck_exam_answers_points"),
    )
    op.create_index("ix_exam_answers_attempt", "exam_answers", ["school_id", "attempt_id"])


def downgrade() -> None:
    op.drop_index("ix_exam_answers_attempt", table_name="exam_answers")
    op.drop_table("exam_answers")
    op.drop_index("ix_exam_attempts_school_exam_status", table_name="exam_attempts")
    op.drop_table("exam_attempts")
    op.drop_index("ix_exam_options_question", table_name="exam_options")
    op.drop_table("exam_options")
    op.drop_index("ix_exam_questions_exam", table_name="exam_questions")
    op.drop_table("exam_questions")
    op.drop_index("ix_online_exams_school_published", table_name="online_exams")
    op.drop_table("online_exams")
