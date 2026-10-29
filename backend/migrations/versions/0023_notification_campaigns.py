"""Record school notices sent to parents, alongside their per-user notifications."""
import sqlalchemy as sa
from alembic import op

revision = "0023_notification_campaigns"
down_revision = "0022_parent_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_campaigns",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(length=20), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=True),
        sa.Column("student_id", sa.Uuid(), nullable=True),
        sa.Column("recipient_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_notification_campaigns_school_id"),
        sa.CheckConstraint(
            "audience IN ('all_parents', 'class', 'student')",
            name="ck_notification_campaigns_audience",
        ),
    )
    op.create_index(
        "ix_notification_campaigns_school_created",
        "notification_campaigns",
        ["school_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_campaigns_school_created", table_name="notification_campaigns")
    op.drop_table("notification_campaigns")
