"""Give someone a role (member, moderator or admin). Run it on the server, from the backend folder:

    python -m app.roles list
    python -m app.roles set someone@example.com moderator
    python -m app.roles set someone@example.com member      (takes the role away)

There's deliberately no button for this in the website: changing roles needs access to the server.
"""

import argparse
import sys

from app.db import get_connection, run_migrations

ROLES = ("member", "moderator", "admin")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Manage Meetkat moderator and admin roles.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="show everyone who is a moderator or admin")
    setter = sub.add_parser("set", help="give someone a role")
    setter.add_argument("email")
    setter.add_argument("role", choices=ROLES)
    args = parser.parse_args(argv)

    run_migrations()
    with get_connection() as conn, conn.cursor() as cur:
        if args.command == "list":
            cur.execute("SELECT email, name, role FROM users WHERE role <> 'member' ORDER BY role, email")
            rows = cur.fetchall()
            for row in rows:
                print(f"{row['role']:<10} {row['email']}  ({row['name']})")
            if not rows:
                print("Nobody is a moderator or admin yet.")
            return 0
        cur.execute("UPDATE users SET role = %s WHERE email = %s AND is_demo = FALSE RETURNING name",
                    (args.role, args.email.lower()))
        row = cur.fetchone()
    if not row:
        print(f"No (non-demo) account with the email {args.email}.")
        return 1
    print(f"{row['name']} ({args.email}) is now: {args.role}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
