"""Add audited partial refunds for invoice payments."""
import sqlalchemy as sa
from alembic import op


revision = "0014_payment_refunds"
down_revision = "0013_user_totp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_refunds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("refund_number", sa.String(length=24), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False),
        sa.Column("refund_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payment_refunds_amount"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["student_invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_payment_refunds_school_id"),
        sa.UniqueConstraint("school_id", "refund_number", name="uq_payment_refunds_school_number"),
    )
    op.create_index("ix_payment_refunds_school_invoice", "payment_refunds", ["school_id", "invoice_id"])
    op.create_table(
        "payment_refund_allocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("refund_id", sa.Uuid(), nullable=False),
        sa.Column("payment_allocation_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payment_refund_allocations_amount"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["refund_id"], ["payment_refunds.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_allocation_id"], ["payment_allocations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_payment_refund_allocations_school_id"),
    )
    op.create_index("ix_payment_refund_allocations_refund", "payment_refund_allocations", ["refund_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_refund_allocations_refund", table_name="payment_refund_allocations")
    op.drop_table("payment_refund_allocations")
    op.drop_index("ix_payment_refunds_school_invoice", table_name="payment_refunds")
    op.drop_table("payment_refunds")
