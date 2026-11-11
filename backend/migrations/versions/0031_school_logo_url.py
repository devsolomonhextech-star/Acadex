"""Store an optional school logo URL for workspace branding."""
import sqlalchemy as sa
from alembic import op

revision = "0031_school_logo_url"
down_revision = "0030_platform_admins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("logo_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "logo_url")
