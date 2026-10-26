"""Give every institution a three-month free trial window."""
import sqlalchemy as sa
from alembic import op


revision = "0017_school_trial"
down_revision = "0016_school_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    # Existing institutions keep the same three-month terms as new signups.
    op.execute(
        "UPDATE schools SET trial_ends_at = created_at + interval '3 months' "
        "WHERE trial_ends_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("schools", "trial_ends_at")
