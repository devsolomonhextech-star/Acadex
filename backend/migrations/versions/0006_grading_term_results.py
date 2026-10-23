"""Add school grading scales, weighted term results, and result publication state."""
import sqlalchemy as sa
from alembic import op

revision = "0006_grading_term_results"
down_revision = "0005_assessment_gradebook"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "grading_scales",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("include_positions", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_grading_scales_school_id"),
        sa.UniqueConstraint("school_id", "name", name="uq_grading_scales_school_name"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_grading_scales_status"),
    )
    op.create_index("ix_grading_scales_school_status", "grading_scales", ["school_id", "status"])
    op.create_table(
        "grading_bands",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("scale_id", sa.Uuid(), nullable=False),
        sa.Column("min_percent", sa.Numeric(5, 2), nullable=False), sa.Column("max_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("grade", sa.String(12), nullable=False), sa.Column("points", sa.Numeric(4, 2)),
        sa.Column("description", sa.String(80)),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "scale_id"], ["grading_scales.school_id", "grading_scales.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "id", name="uq_grading_bands_school_id"),
        sa.UniqueConstraint("scale_id", "min_percent", name="uq_grading_bands_scale_min"),
        sa.CheckConstraint("min_percent >= 0 AND max_percent <= 100 AND min_percent <= max_percent", name="ck_grading_bands_range"),
    )
    op.create_index("ix_grading_bands_scale", "grading_bands", ["school_id", "scale_id"])
    op.create_table(
        "term_subject_results",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False), sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False), sa.Column("subject_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("weighted_total", sa.Numeric(6, 2), nullable=False),
        sa.Column("grade", sa.String(12)), sa.Column("points", sa.Numeric(4, 2)),
        sa.Column("assessment_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_weight", sa.Numeric(7, 2), server_default="0", nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "term_id", "class_group_id", "subject_id", "student_id", name="uq_term_subject_results_row"),
        sa.CheckConstraint("weighted_total >= 0 AND weighted_total <= 100", name="ck_term_subject_results_total"),
        sa.CheckConstraint("total_weight >= 0", name="ck_term_subject_results_weight"),
    )
    op.create_index("ix_term_subject_results_school_class_term", "term_subject_results", ["school_id", "class_group_id", "term_id"])
    op.create_index("ix_term_subject_results_school_student", "term_subject_results", ["school_id", "student_id"])
    op.create_table(
        "term_results",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False), sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False), sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("aggregate_percent", sa.Numeric(6, 2), nullable=False),
        sa.Column("grade", sa.String(12)), sa.Column("points", sa.Numeric(4, 2)), sa.Column("position", sa.Integer()),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "term_id", "class_group_id", "student_id", name="uq_term_results_row"),
        sa.CheckConstraint("aggregate_percent >= 0 AND aggregate_percent <= 100", name="ck_term_results_aggregate"),
        sa.CheckConstraint("position IS NULL OR position >= 1", name="ck_term_results_position"),
    )
    op.create_index("ix_term_results_school_class_term", "term_results", ["school_id", "class_group_id", "term_id"])
    op.create_index("ix_term_results_school_student", "term_results", ["school_id", "student_id"])
    op.create_table(
        "result_publications",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False), sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("grading_scale_id", sa.Uuid()),
        sa.Column("published_by_membership_id", sa.Uuid()), sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("withdrawn_by_membership_id", sa.Uuid()), sa.Column("withdrawn_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "grading_scale_id"], ["grading_scales.school_id", "grading_scales.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by_membership_id"], ["school_memberships.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["withdrawn_by_membership_id"], ["school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "term_id", "class_group_id", name="uq_result_publications_row"),
        sa.CheckConstraint("status IN ('draft', 'published', 'withdrawn')", name="ck_result_publications_status"),
    )
    op.create_index("ix_result_publications_school_class_term", "result_publications", ["school_id", "class_group_id", "term_id"])


def downgrade() -> None:
    op.drop_index("ix_result_publications_school_class_term", table_name="result_publications")
    op.drop_table("result_publications")
    op.drop_index("ix_term_results_school_student", table_name="term_results")
    op.drop_index("ix_term_results_school_class_term", table_name="term_results")
    op.drop_table("term_results")
    op.drop_index("ix_term_subject_results_school_student", table_name="term_subject_results")
    op.drop_index("ix_term_subject_results_school_class_term", table_name="term_subject_results")
    op.drop_table("term_subject_results")
    op.drop_index("ix_grading_bands_scale", table_name="grading_bands")
    op.drop_table("grading_bands")
    op.drop_index("ix_grading_scales_school_status", table_name="grading_scales")
    op.drop_table("grading_scales")
