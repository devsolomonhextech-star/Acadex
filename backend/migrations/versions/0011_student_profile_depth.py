"""Student profile depth: contact fields, portal link, behavior records, documents.

Revision ID: 0011_student_profile_depth
Revises: 0010_guardians_communications
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0011_student_profile_depth"
down_revision = "0010_guardians_communications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("gender", sa.String(16), nullable=True))
    op.add_column("students", sa.Column("phone", sa.String(40), nullable=True))
    op.add_column("students", sa.Column("email", sa.String(254), nullable=True))
    op.add_column("students", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_students_user_id", "students", "users", ["user_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_students_school_user", "students", ["school_id", "user_id"], unique=False)

    op.create_table(
        "behavior_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("school_id", sa.Uuid(), sa.ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("action_taken", sa.String(240), nullable=True),
        sa.Column("recorded_by_membership_id", sa.Uuid(), sa.ForeignKey("school_memberships.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("category IN ('merit', 'demerit', 'incident', 'note')", name="ck_behavior_records_category"),
        sa.CheckConstraint("severity IN ('low', 'medium', 'high')", name="ck_behavior_records_severity"),
        sa.UniqueConstraint("school_id", "id", name="uq_behavior_records_school_id"),
    )
    op.create_index("ix_behavior_records_school_student", "behavior_records", ["school_id", "student_id"])
    op.create_index("ix_behavior_records_school_date", "behavior_records", ["school_id", "occurred_on"])

    op.create_table(
        "student_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("school_id", sa.Uuid(), sa.ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("doc_type", sa.String(32), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("reference", sa.String(80), nullable=True),
        sa.Column("issued_on", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("doc_type IN ('id_card', 'birth_certificate', 'previous_report', 'medical', 'consent', 'other')", name="ck_student_documents_type"),
        sa.UniqueConstraint("school_id", "id", name="uq_student_documents_school_id"),
    )
    op.create_index("ix_student_documents_school_student", "student_documents", ["school_id", "student_id"])


def downgrade() -> None:
    op.drop_index("ix_student_documents_school_student", table_name="student_documents")
    op.drop_table("student_documents")
    op.drop_index("ix_behavior_records_school_date", table_name="behavior_records")
    op.drop_index("ix_behavior_records_school_student", table_name="behavior_records")
    op.drop_table("behavior_records")
    op.drop_index("ix_students_school_user", table_name="students")
    op.drop_constraint("fk_students_user_id", "students", type_="foreignkey")
    op.drop_column("students", "user_id")
    op.drop_column("students", "email")
    op.drop_column("students", "phone")
    op.drop_column("students", "gender")
