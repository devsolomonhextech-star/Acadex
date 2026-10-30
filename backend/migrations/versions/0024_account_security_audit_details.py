"""Add email action tokens and richer audit event details."""
import sqlalchemy as sa
from alembic import op

revision = "0024_auth_audit_details"
down_revision = "0023_notification_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    # Existing accounts predate verification; preserve them as verified while
    # all accounts created after this migration must complete email verification.
    op.execute("UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE email_verified_at IS NULL")
    op.add_column("audit_events", sa.Column("details", sa.JSON(), nullable=True))
    op.create_table(
        "account_action_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("kind IN ('email_verification', 'password_reset')", name="ck_account_action_tokens_kind"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_account_action_tokens_token_hash"),
    )
    op.create_index("ix_account_action_tokens_user_kind", "account_action_tokens", ["user_id", "kind", "expires_at"])


def downgrade() -> None:
    op.drop_index("ix_account_action_tokens_user_kind", table_name="account_action_tokens")
    op.drop_table("account_action_tokens")
    op.drop_column("audit_events", "details")
    op.drop_column("users", "email_verified_at")
