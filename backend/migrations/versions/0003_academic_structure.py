"""Add school-scoped academic years, terms, classes, and enrollments."""
import sqlalchemy as sa
from alembic import op

revision = "0003_academic_structure"
down_revision = "0002_student_directory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_students_school_id", "students", ["school_id", "id"])
    op.create_table(
        "academic_years",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False), sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False), sa.Column("status", sa.String(20), server_default="planned", nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "name", name="uq_academic_years_school_name"),
        sa.UniqueConstraint("school_id", "id", name="uq_academic_years_school_id"),
        sa.CheckConstraint("starts_on <= ends_on", name="ck_academic_years_dates"),
    )
    op.create_index("ix_academic_years_school_dates", "academic_years", ["school_id", "starts_on"])
    op.create_table(
        "academic_terms",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False), sa.Column("name", sa.String(80), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False), sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "academic_year_id", "ordinal", name="uq_terms_year_ordinal"),
        sa.UniqueConstraint("school_id", "academic_year_id", "name", name="uq_terms_year_name"),
        sa.CheckConstraint("starts_on <= ends_on", name="ck_terms_dates"),
    )
    op.create_index("ix_terms_school_year", "academic_terms", ["school_id", "academic_year_id"])
    op.create_table(
        "class_groups",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False), sa.Column("name", sa.String(80), nullable=False),
        sa.Column("grade_level", sa.String(40), nullable=False), sa.Column("stream", sa.String(40), server_default="", nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "academic_year_id", "id", name="uq_class_groups_school_year_id"),
        sa.UniqueConstraint("school_id", "academic_year_id", "name", "stream", name="uq_class_groups_year_name_stream"),
    )
    op.create_index("ix_class_groups_school_year", "class_groups", ["school_id", "academic_year_id"])
    op.create_table(
        "student_enrollments",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False), sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False), sa.Column("enrolled_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("student_id", "academic_year_id", name="uq_enrollments_student_year"),
    )
    op.create_index("ix_enrollments_school_class", "student_enrollments", ["school_id", "class_group_id"])


def downgrade() -> None:
    op.drop_index("ix_enrollments_school_class", table_name="student_enrollments")
    op.drop_table("student_enrollments")
    op.drop_index("ix_class_groups_school_year", table_name="class_groups")
    op.drop_table("class_groups")
    op.drop_index("ix_terms_school_year", table_name="academic_terms")
    op.drop_table("academic_terms")
    op.drop_index("ix_academic_years_school_dates", table_name="academic_years")
    op.drop_table("academic_years")
    op.drop_constraint("uq_students_school_id", "students", type_="unique")
