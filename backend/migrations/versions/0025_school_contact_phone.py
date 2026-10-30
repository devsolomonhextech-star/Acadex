"""Add school phone number for parent app contact."""
import sqlalchemy as sa
from alembic import op

revision = "0025_school_contact_phone"
down_revision = "0024_auth_audit_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("contact_phone", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "contact_phone")
