"""Create identity, membership, refresh session, and audit foundations."""
import sqlalchemy as sa
from alembic import op

revision = "0001_identity_tenant_foundation"
down_revision = None
branch_labels = None
depends_on = None

membership_role = sa.Enum("SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "FINANCE", "REGISTRAR", "PARENT", "STUDENT", "STAFF", name="membership_role")


def upgrade() -> None:
    op.create_table("schools",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("slug", name="uq_schools_slug"))
    op.create_table("users",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("email", sa.String(254), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("email", name="uq_users_email"))
    op.create_table("school_memberships",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False), sa.Column("role", membership_role, nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "user_id", name="uq_memberships_school_user"))
    op.create_index("ix_memberships_user_status", "school_memberships", ["user_id", "status"])
    op.create_table("refresh_sessions",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False), sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("token_hash"))
    op.create_index("ix_refresh_sessions_user_expiry", "refresh_sessions", ["user_id", "expires_at"])
    op.create_index("ix_refresh_sessions_family", "refresh_sessions", ["family_id"])
    op.create_table("audit_events",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid()), sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(80), nullable=False), sa.Column("resource_id", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_audit_school_created", "audit_events", ["school_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_school_created", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_refresh_sessions_user_expiry", table_name="refresh_sessions")
    op.drop_index("ix_refresh_sessions_family", table_name="refresh_sessions")
    op.drop_table("refresh_sessions")
    op.drop_index("ix_memberships_user_status", table_name="school_memberships")
    op.drop_table("school_memberships")
    op.drop_table("users")
    op.drop_table("schools")
    membership_role.drop(op.get_bind())
