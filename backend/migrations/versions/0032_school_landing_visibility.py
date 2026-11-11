"""Allow platform admins to opt schools into the public landing page."""
import sqlalchemy as sa
from alembic import op

revision = "0032_school_landing_visibility"
down_revision = "0031_school_logo_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "schools",
        sa.Column("show_on_landing", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("schools", "show_on_landing")
