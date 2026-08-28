#!/usr/bin/env python
"""Grant or revoke the admin flag on a user — Phase 4 W7.

There is deliberately no API endpoint that grants admin. Any such endpoint is
a privilege-escalation target, and the product needs exactly one bootstrap
admin plus the occasional change, which is a job for someone with shell access
to the deployment rather than a feature.

Usage:
    python scripts/grant_admin.py rider@example.com
    python scripts/grant_admin.py rider@example.com --revoke
    python scripts/grant_admin.py --list
"""
from __future__ import annotations

import argparse
import os
import sys

# Make `app` importable when run as `python scripts/grant_admin.py` from the
# backend directory — same bootstrap the other scripts in here use.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", nargs="?", help="email of the user to change")
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="remove admin instead of granting it",
    )
    parser.add_argument(
        "--list", action="store_true", help="list current admins and exit"
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            admins = db.query(User).filter(User.is_admin.is_(True)).all()
            if not admins:
                print("No admins configured.")
            for u in admins:
                print(f"  {u.email}  ({u.name})")
            return 0

        if not args.email:
            parser.error("an email is required unless --list is given")

        user = db.query(User).filter(User.email == args.email).first()
        if user is None:
            print(f"No user with email {args.email!r}", file=sys.stderr)
            return 1

        target = not args.revoke
        if user.is_admin == target:
            print(
                f"{user.email} is already "
                f"{'an admin' if target else 'a regular user'}; nothing to do."
            )
            return 0

        user.is_admin = target
        db.commit()
        verb = "granted to" if target else "revoked from"
        print(f"Admin {verb} {user.email}")

        remaining = db.query(User).filter(User.is_admin.is_(True)).count()
        if remaining == 0:
            # Worth saying out loud: with no admins left, the moderation queue
            # is unreachable and only this script can restore access.
            print(
                "WARNING: there are now no admin accounts. The moderation "
                "queue is inaccessible until one is granted."
            )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
