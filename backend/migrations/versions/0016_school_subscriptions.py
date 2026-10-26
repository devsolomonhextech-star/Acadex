"""Add per-school student subscriptions and payment records."""
import sqlalchemy as sa
from alembic import op


revision = "0016_school_subscriptions"
down_revision = "0015_early_student_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "school_subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_limit", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="inactive", nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("student_limit >= 0", name="ck_school_subscriptions_student_limit"),
        sa.CheckConstraint("status IN ('inactive', 'active')", name="ck_school_subscriptions_status"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", name="uq_school_subscriptions_school"),
    )
    op.create_table(
        "subscription_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=False),
        sa.Column("student_limit", sa.Integer(), nullable=False),
        sa.Column("amount_pesewas", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="GHS", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("student_limit >= 1", name="ck_subscription_payments_student_limit"),
        sa.CheckConstraint("amount_pesewas > 0", name="ck_subscription_payments_amount"),
        sa.CheckConstraint("status IN ('pending', 'paid', 'failed')", name="ck_subscription_payments_status"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference", name="uq_subscription_payments_reference"),
    )
    op.create_index(
        "ix_subscription_payments_school_created",
        "subscription_payments",
        ["school_id", "created_at"],
    )
    # Preserve the existing roster as the school's initial seat limit. Those
    # seats are not marked paid: the inactive subscription prevents new adds
    # until the administrator activates a monthly plan.
    op.execute(
        """INSERT INTO school_subscriptions (id, school_id, student_limit, status)
           SELECT gen_random_uuid(), schools.id,
                  (SELECT count(*) FROM students
                   WHERE students.school_id = schools.id AND students.status = 'active'),
                  'inactive'
           FROM schools"""
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_payments_school_created", table_name="subscription_payments")
    op.drop_table("subscription_payments")
    op.drop_table("school_subscriptions")
