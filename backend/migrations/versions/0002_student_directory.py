"""Add tenant-scoped student directory."""
import sqlalchemy as sa
from alembic import op

revision = "0002_student_directory"
down_revision = "0001_identity_tenant_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "students",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("admission_number", sa.String(length=40), nullable=False),
        sa.Column("first_name", sa.String(length=80), nullable=False),
        sa.Column("last_name", sa.String(length=80), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=24), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "admission_number", name="uq_students_school_admission"),
    )
    op.create_index(
        "ix_students_school_status_name",
        "students",
        ["school_id", "status", "last_name", "first_name"],
    )


def downgrade() -> None:
    op.drop_index("ix_students_school_status_name", table_name="students")
    op.drop_table("students")
