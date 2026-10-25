"""Track assignment submission states and human-led student support plans."""
import sqlalchemy as sa
from alembic import op


revision = "0015_early_student_support"
down_revision = "0014_payment_refunds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessment_scores",
        sa.Column("submission_status", sa.String(length=20), server_default="not_recorded", nullable=False),
    )
    op.execute("UPDATE assessment_scores SET submission_status = 'submitted' WHERE score IS NOT NULL")
    op.create_check_constraint(
        "ck_assessment_scores_submission_status",
        "assessment_scores",
        "submission_status IN ('not_recorded', 'submitted', 'missing', 'excused')",
    )
    op.create_table(
        "student_support_interventions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("term_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_to_membership_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="planned", nullable=False),
        sa.Column("follow_up_on", sa.Date(), nullable=True),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column("baseline_attendance_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("baseline_assessment_average", sa.Numeric(5, 2), nullable=True),
        sa.Column("latest_attendance_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("latest_assessment_average", sa.Numeric(5, 2), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('planned', 'in_progress', 'completed', 'cancelled')",
            name="ck_student_support_interventions_status",
        ),
        sa.CheckConstraint(
            "category IN ('attendance', 'academic', 'assignment', 'wellbeing', 'family_contact', 'other')",
            name="ck_student_support_interventions_category",
        ),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "created_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "assigned_to_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_student_support_interventions_school_id"),
    )
    op.create_index(
        "ix_support_interventions_school_year_status",
        "student_support_interventions", ["school_id", "academic_year_id", "status"],
    )
    op.create_index(
        "ix_support_interventions_school_student",
        "student_support_interventions", ["school_id", "student_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_support_interventions_school_student", table_name="student_support_interventions")
    op.drop_index("ix_support_interventions_school_year_status", table_name="student_support_interventions")
    op.drop_table("student_support_interventions")
    op.drop_constraint("ck_assessment_scores_submission_status", "assessment_scores", type_="check")
    op.drop_column("assessment_scores", "submission_status")
