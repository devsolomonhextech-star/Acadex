"""Store the school's Smart Dismissal configuration.

Admins set closing times per weekday, when pickup reminders go to parents, and
how a child may be handed over. Defaults keep dismissal disabled until a school
turns it on, so no reminder is ever sent for an unconfigured school.
"""
import sqlalchemy as sa
from alembic import op

revision = "0029_dismissal_settings"
down_revision = "0028_admission_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("dismissal_settings", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "dismissal_settings")
