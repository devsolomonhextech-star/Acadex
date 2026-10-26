"""Give every class an optional class teacher (form teacher)."""
import sqlalchemy as sa
from alembic import op


revision = "0018_class_teachers"
down_revision = "0017_school_trial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "class_groups",
        sa.Column("class_teacher_membership_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_class_groups_class_teacher",
        "class_groups",
        "school_memberships",
        ["class_teacher_membership_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # One teacher can be the class teacher of at most one class at a time.
    op.create_index(
        "uq_class_groups_class_teacher",
        "class_groups",
        ["school_id", "class_teacher_membership_id"],
        unique=True,
        postgresql_where=sa.text("class_teacher_membership_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_class_groups_class_teacher", table_name="class_groups")
    op.drop_constraint("fk_class_groups_class_teacher", "class_groups", type_="foreignkey")
    op.drop_column("class_groups", "class_teacher_membership_id")
