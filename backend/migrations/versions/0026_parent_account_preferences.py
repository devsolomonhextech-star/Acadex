"""Store parent notification preferences."""
import sqlalchemy as sa
from alembic import op

revision = "0026_parent_account_preferences"
down_revision = "0025_school_contact_phone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("notification_preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "notification_preferences")
