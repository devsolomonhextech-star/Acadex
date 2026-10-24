"""Add weekly timetable slots for classes, subjects, and teachers."""
import sqlalchemy as sa
from alembic import op

revision = "0009_timetable_slots"
down_revision = "0008_finance_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "timetable_slots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=False),
        sa.Column("teacher_membership_id", sa.Uuid(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.Time(), nullable=False),
        sa.Column("ends_at", sa.Time(), nullable=False),
        sa.Column("room", sa.String(40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "teacher_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_timetable_slots_school_id"),
        sa.CheckConstraint("starts_at < ends_at", name="ck_timetable_slots_times"),
        sa.CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_timetable_slots_day"),
    )
    op.create_index("ix_timetable_school_year_day", "timetable_slots", ["school_id", "academic_year_id", "day_of_week"])
    op.create_index("ix_timetable_school_class_day", "timetable_slots", ["school_id", "class_group_id", "day_of_week"])
    op.create_index("ix_timetable_school_teacher_day", "timetable_slots", ["school_id", "teacher_membership_id", "day_of_week"])


def downgrade() -> None:
    op.drop_index("ix_timetable_school_teacher_day", table_name="timetable_slots")
    op.drop_index("ix_timetable_school_class_day", table_name="timetable_slots")
    op.drop_index("ix_timetable_school_year_day", table_name="timetable_slots")
    op.drop_table("timetable_slots")
