"""Store school-wide automatic parent alert switches."""
import sqlalchemy as sa
from alembic import op

revision = "0027_school_alert_settings"
down_revision = "0026_parent_account_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("notification_settings", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "notification_settings")