"""Add student import jobs: validated previews with confirm-to-create counts."""
import sqlalchemy as sa
from alembic import op

revision = "0007_student_import_jobs"
down_revision = "0006_grading_term_results"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_import_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), server_default="previewed", nullable=False),
        sa.Column("column_map", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("preview_rows", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("total_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("valid_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("duplicate_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("skipped_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_student_import_jobs_school_id"),
        sa.CheckConstraint(
            "status IN ('previewed', 'confirmed')", name="ck_student_import_jobs_status"
        ),
        sa.CheckConstraint(
            "total_rows >= 0 AND valid_rows >= 0 AND error_rows >= 0 AND duplicate_rows >= 0"
            " AND created_rows >= 0 AND skipped_rows >= 0",
            name="ck_student_import_jobs_counts",
        ),
    )
    op.create_index(
        "ix_student_import_jobs_school_created", "student_import_jobs", ["school_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_student_import_jobs_school_created", table_name="student_import_jobs")
    op.drop_table("student_import_jobs")
