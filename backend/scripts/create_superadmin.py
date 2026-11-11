"""Create or update an Acadex platform (superadmin) account.

    python scripts/create_superadmin.py --email you@acadex.app --name "Your Name"

The password is read from --password or SUPERADMIN_PASSWORD so it never has to
appear in shell history or source control. Running the command again rotates
the password and keeps the existing platform role.
"""
import argparse
import asyncio
import getpass
import os
import sys
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.db import session_factory
from app.models import PlatformAdmin, User
from app.security import hash_password


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a platform superadmin.")
    parser.add_argument("--email", default=os.environ.get("SUPERADMIN_EMAIL"))
    parser.add_argument("--name", default=os.environ.get("SUPERADMIN_NAME", "Acadex Superadmin"))
    parser.add_argument("--password", default=os.environ.get("SUPERADMIN_PASSWORD"))
    parser.add_argument("--role", default="superadmin", choices=("superadmin", "support"))
    args = parser.parse_args()
    if not args.email:
        parser.error("Provide --email (or SUPERADMIN_EMAIL).")
    if not args.password:
        args.password = getpass.getpass("New superadmin password (12+ characters): ")
    if len(args.password) < 12:
        parser.error("Choose a password with at least 12 characters.")
    args.email = args.email.strip().casefold()
    return args


async def _upsert(args: argparse.Namespace) -> None:
    async with session_factory() as session:
        user = await session.scalar(select(User).where(func.lower(User.email) == args.email))
        if user is None:
            user = User(
                email=args.email, display_name=args.name.strip(),
                password_hash=hash_password(args.password),
                email_verified_at=datetime.now(UTC),
            )
            session.add(user)
            await session.flush()
            action = "created"
        else:
            user.password_hash = hash_password(args.password)
            user.display_name = args.name.strip()
            user.email_verified_at = user.email_verified_at or datetime.now(UTC)
            user.status = "active"
            action = "updated"

        admin = await session.scalar(select(PlatformAdmin).where(PlatformAdmin.user_id == user.id))
        if admin is None:
            admin = PlatformAdmin(user_id=user.id, role=args.role, status="active")
            session.add(admin)
        else:
            admin.role = args.role
            admin.status = "active"
        try:
            await session.commit()
        except IntegrityError as error:
            await session.rollback()
            raise SystemExit(f"Could not save the platform admin: {error.orig}") from error
        print(f"Platform {args.role} {action}: {user.email}")


def main() -> None:
    args = _arguments()
    try:
        asyncio.run(_upsert(args))
    except OSError as error:
        sys.exit(f"Could not reach the database: {error}")


if __name__ == "__main__":
    main()
