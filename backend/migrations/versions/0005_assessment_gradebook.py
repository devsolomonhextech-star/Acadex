"""Add configurable classroom assessments and auditable score moderation."""
import sqlalchemy as sa
from alembic import op

revision = "0005_assessment_gradebook"
down_revision = "0004_teachers_attendance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_terms_school_year_id", "academic_terms", ["school_id", "academic_year_id", "id"])
    op.create_table(
        "assessments",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False), sa.Column("class_group_id", sa.Uuid(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=False), sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False), sa.Column("category", sa.String(32), nullable=False),
        sa.Column("max_score", sa.Numeric(7, 2), nullable=False),
        sa.Column("weight_percent", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("due_on", sa.Date()), sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("review_note", sa.String(1000)), sa.Column("created_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("reviewed_by_membership_id", sa.Uuid()), sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "created_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "reviewed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_assessments_school_id"),
        sa.UniqueConstraint("school_id", "class_group_id", "subject_id", "term_id", "title", name="uq_assessments_class_subject_term_title"),
        sa.CheckConstraint("max_score > 0 AND max_score <= 1000", name="ck_assessments_positive_max_score"),
        sa.CheckConstraint("category IN ('quiz', 'assignment', 'project', 'class_test', 'examination', 'practical', 'other')", name="ck_assessments_category"),
        sa.CheckConstraint("weight_percent >= 0 AND weight_percent <= 100", name="ck_assessments_weight_range"),
        sa.CheckConstraint("status IN ('open', 'submitted', 'returned', 'approved')", name="ck_assessments_status"),
    )
    op.create_index("ix_assessments_school_class_term", "assessments", ["school_id", "class_group_id", "term_id"])
    op.create_index("ix_assessments_school_status", "assessments", ["school_id", "status"])
    op.create_table(
        "assessment_scores",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False), sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Numeric(7, 2)), sa.Column("comment", sa.String(240)),
        sa.Column("updated_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "assessment_id"], ["assessments.school_id", "assessments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "updated_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "assessment_id", "student_id", name="uq_assessment_score_student"),
        sa.CheckConstraint("score IS NULL OR score >= 0", name="ck_assessment_scores_nonnegative"),
    )
    op.create_index("ix_assessment_scores_school_student", "assessment_scores", ["school_id", "student_id"])


def downgrade() -> None:
    op.drop_index("ix_assessment_scores_school_student", table_name="assessment_scores")
    op.drop_table("assessment_scores")
    op.drop_index("ix_assessments_school_status", table_name="assessments")
    op.drop_index("ix_assessments_school_class_term", table_name="assessments")
    op.drop_table("assessments")
    op.drop_constraint("uq_terms_school_year_id", "academic_terms", type_="unique")
