"""Platform admins and their rotating console sessions."""
import sqlalchemy as sa
from alembic import op

revision = "0030_platform_admins"
down_revision = "0029_dismissal_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_admins",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False, server_default="superadmin"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_platform_admins_user"),
        sa.CheckConstraint("role IN ('superadmin', 'support')", name="ck_platform_admins_role"),
        sa.CheckConstraint("status IN ('active', 'suspended')", name="ck_platform_admins_status"),
    )
    op.create_table(
        "platform_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("platform_admin_id", sa.Uuid(),
                  sa.ForeignKey("platform_admins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_platform_sessions_admin_expiry", "platform_sessions",
                    ["platform_admin_id", "expires_at"])


def downgrade() -> None:
    op.drop_index("ix_platform_sessions_admin_expiry", table_name="platform_sessions")
    op.drop_table("platform_sessions")
    op.drop_table("platform_admins")
