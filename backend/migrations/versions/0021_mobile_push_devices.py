"""Store authenticated mobile push targets per user and school."""
import sqlalchemy as sa
from alembic import op

revision = "0021_mobile_push_devices"
down_revision = "0020_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mobile_push_devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("push_token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=12), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "user_id", "push_token", name="uq_mobile_push_school_user_token"),
    )
    op.create_index("ix_mobile_push_school_user", "mobile_push_devices", ["school_id", "user_id"])


def downgrade() -> None:
    op.drop_index("ix_mobile_push_school_user", table_name="mobile_push_devices")
    op.drop_table("mobile_push_devices")
