"""Add school-owned tasks that admins assign to teachers and teachers complete."""
import sqlalchemy as sa
from alembic import op

revision = "0020_tasks"
down_revision = "0019_online_exams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("priority", sa.String(16), server_default="medium", nullable=False),
        sa.Column("due_on", sa.Date()),
        sa.Column("assigned_to_membership_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("completed_by_membership_id", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "assigned_to_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "assigned_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "completed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_tasks_school_id"),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'completed', 'cancelled')", name="ck_tasks_status"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high')", name="ck_tasks_priority"),
    )
    op.create_index("ix_tasks_school_assigned", "tasks", ["school_id", "assigned_to_membership_id"])
    op.create_index("ix_tasks_school_status", "tasks", ["school_id", "status"])
    op.create_index("ix_tasks_school_due", "tasks", ["school_id", "due_on"])


def downgrade() -> None:
    op.drop_index("ix_tasks_school_due", table_name="tasks")
    op.drop_index("ix_tasks_school_status", table_name="tasks")
    op.drop_index("ix_tasks_school_assigned", table_name="tasks")
    op.drop_table("tasks")
