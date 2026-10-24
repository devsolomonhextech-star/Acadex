"""Add finance core: fee categories/structures, invoices, payments, allocations."""
import sqlalchemy as sa
from alembic import op

revision = "0008_finance_core"
down_revision = "0007_student_import_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fee_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_fee_categories_school_id"),
        sa.UniqueConstraint("school_id", "name", name="uq_fee_categories_school_name"),
    )
    op.create_table(
        "fee_structures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("fee_category_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount >= 0", name="ck_fee_structures_amount"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_fee_structures_status"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["fee_category_id"], ["fee_categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["class_group_id"], ["class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["term_id"], ["academic_terms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_fee_structures_school_id"),
        sa.UniqueConstraint(
            "school_id", "fee_category_id", "class_group_id", "term_id",
            name="uq_fee_structures_scope",
        ),
    )
    op.create_index(
        "ix_fee_structures_school_class", "fee_structures", ["school_id", "class_group_id"]
    )
    op.create_table(
        "student_invoices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_number", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), server_default="issued", nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("paid_amount", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('issued', 'partially_paid', 'paid', 'void')",
            name="ck_student_invoices_status",
        ),
        sa.CheckConstraint("total_amount >= 0 AND paid_amount >= 0", name="ck_student_invoices_amounts"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["term_id"], ["academic_terms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_student_invoices_school_id"),
        sa.UniqueConstraint("school_id", "invoice_number", name="uq_student_invoices_school_number"),
    )
    op.create_index(
        "ix_student_invoices_school_student", "student_invoices", ["school_id", "student_id"]
    )
    op.create_index(
        "ix_student_invoices_school_term", "student_invoices", ["school_id", "term_id"]
    )
    op.create_table(
        "invoice_line_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("fee_structure_id", sa.Uuid(), nullable=True),
        sa.Column("fee_category_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(160), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount >= 0", name="ck_invoice_line_items_amount"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["student_invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["fee_structure_id"], ["fee_structures.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["fee_category_id"], ["fee_categories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_invoice_line_items_school_id"),
    )
    op.create_index("ix_invoice_line_items_invoice", "invoice_line_items", ["invoice_id"])
    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(80), nullable=True),
        sa.Column("receipt_number", sa.String(24), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), server_default="recorded", nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payments_amount"),
        sa.CheckConstraint("status IN ('recorded', 'voided')", name="ck_payments_status"),
        sa.CheckConstraint(
            "method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')",
            name="ck_payments_method",
        ),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_payments_school_id"),
        sa.UniqueConstraint("school_id", "receipt_number", name="uq_payments_school_receipt"),
    )
    op.create_index("ix_payments_school_student", "payments", ["school_id", "student_id"])
    op.create_index("ix_payments_school_date", "payments", ["school_id", "payment_date"])
    op.create_index(
        "uq_payments_school_reference",
        "payments",
        ["school_id", "reference"],
        unique=True,
        postgresql_where=sa.text("reference IS NOT NULL"),
    )
    op.create_table(
        "payment_allocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payment_allocations_amount"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["student_invoices.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_payment_allocations_school_id"),
    )
    op.create_index("ix_payment_allocations_payment", "payment_allocations", ["payment_id"])
    op.create_index("ix_payment_allocations_invoice", "payment_allocations", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_allocations_invoice", table_name="payment_allocations")
    op.drop_index("ix_payment_allocations_payment", table_name="payment_allocations")
    op.drop_table("payment_allocations")
    op.drop_index("uq_payments_school_reference", table_name="payments")
    op.drop_index("ix_payments_school_date", table_name="payments")
    op.drop_index("ix_payments_school_student", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_invoice_line_items_invoice", table_name="invoice_line_items")
    op.drop_table("invoice_line_items")
    op.drop_index("ix_student_invoices_school_term", table_name="student_invoices")
    op.drop_index("ix_student_invoices_school_student", table_name="student_invoices")
    op.drop_table("student_invoices")
    op.drop_index("ix_fee_structures_school_class", table_name="fee_structures")
    op.drop_table("fee_structures")
    op.drop_table("fee_categories")
