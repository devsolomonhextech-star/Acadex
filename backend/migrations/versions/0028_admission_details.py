"""Collect Ghana Card numbers on students and guardians for admission records."""
import sqlalchemy as sa
from alembic import op

revision = "0028_admission_details"
down_revision = "0027_school_alert_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("ghana_card_number", sa.String(length=20), nullable=True))
    op.create_unique_constraint(
        "uq_students_school_ghana_card", "students", ["school_id", "ghana_card_number"],
    )
    op.add_column("guardians", sa.Column("ghana_card_number", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("guardians", "ghana_card_number")
    op.drop_constraint("uq_students_school_ghana_card", "students", type_="unique")
    op.drop_column("students", "ghana_card_number")
