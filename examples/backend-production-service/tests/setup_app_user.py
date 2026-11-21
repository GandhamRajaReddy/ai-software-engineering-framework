"""
PostgreSQL Dedicated Non-Superuser Role Setup Script
Configures an unprivileged 'app_user' role without superuser or bypassrls privileges
to ensure Row-Level Security (RLS) is validated against true non-superuser boundaries.
"""

import os
import sys
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def configure_non_superuser_role():
    admin_db_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not admin_db_url or "postgresql" not in admin_db_url:
        print("[setup_app_user] Skipping: DATABASE_URL is not PostgreSQL.")
        return

    print(f"[setup_app_user] Connecting to PostgreSQL to configure non-superuser role 'app_user'...")
    engine = create_async_engine(admin_db_url, echo=False)

    async with engine.begin() as conn:
        # Create unprivileged role app_user (NO SUPERUSER, NO BYPASSRLS)
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
                    CREATE ROLE app_user WITH LOGIN PASSWORD 'app_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
                ELSE
                    ALTER ROLE app_user WITH NOSUPERUSER NOBYPASSRLS;
                END IF;
            END
            $$;
        """))

        # Grant DML permissions
        await conn.execute(text("GRANT CONNECT ON DATABASE testdb TO app_user;"))
        await conn.execute(text("GRANT USAGE ON SCHEMA public TO app_user;"))
        await conn.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;"))
        await conn.execute(text("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;"))
        await conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;"))
        await conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;"))

    await engine.dispose()
    print("[setup_app_user] Successfully configured unprivileged non-superuser role 'app_user'.")

if __name__ == "__main__":
    asyncio.run(configure_non_superuser_role())
