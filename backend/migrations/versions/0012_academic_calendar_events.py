"""Add school-scoped academic calendar events."""
import sqlalchemy as sa
from alembic import op


revision = "0012_academic_calendar_events"
down_revision = "0011_student_profile_depth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academic_calendar_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("term_id", sa.Uuid(), nullable=True),
        sa.Column("class_group_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=24), server_default="event", nullable=False),
        sa.Column("audience", sa.String(length=20), server_default="all", nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("starts_on <= ends_on", name="ck_calendar_events_dates"),
        sa.CheckConstraint("audience IN ('all', 'students', 'staff', 'parents', 'teachers', 'class')", name="ck_calendar_events_audience"),
        sa.CheckConstraint("category IN ('term', 'holiday', 'exam', 'meeting', 'event', 'assessment', 'other')", name="ck_calendar_events_category"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_calendar_events_school_id"),
    )
    op.create_index(
        "ix_calendar_events_school_year_dates",
        "academic_calendar_events",
        ["school_id", "academic_year_id", "starts_on", "ends_on"],
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_events_school_year_dates", table_name="academic_calendar_events")
    op.drop_table("academic_calendar_events")
