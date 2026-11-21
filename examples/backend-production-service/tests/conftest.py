import os
import sys

# Guarantee backend root is on sys.path regardless of invocation context
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.main import app
from app.core.database import get_db
from app.core.security import create_access_token
from app.models.base import Base
from app.models.tenant import Tenant

TEST_DATABASE_URL = os.environ.get("DATABASE_URL") or "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    admin_db_url = os.environ.get("ADMIN_DATABASE_URL")
    if admin_db_url and "postgresql" in admin_db_url:
        admin_engine = create_async_engine(admin_db_url, echo=False)
        async with admin_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text("ALTER TABLE items ENABLE ROW LEVEL SECURITY;"))
            await conn.execute(text("ALTER TABLE items FORCE ROW LEVEL SECURITY;"))
            # Execute DROP POLICY and CREATE POLICY as separate statements for asyncpg
            await conn.execute(text("DROP POLICY IF EXISTS tenant_isolation_policy ON items;"))
            await conn.execute(text("""
                CREATE POLICY tenant_isolation_policy ON items
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''))
                WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''));
            """))
        await admin_engine.dispose()
    elif "sqlite" in TEST_DATABASE_URL:
        engine = create_async_engine(TEST_DATABASE_URL, echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield engine
        await engine.dispose()
        return
    else:
        # Fallback if no ADMIN_DATABASE_URL (e.g. single-user PostgreSQL in local dev)
        setup_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
        try:
            async with setup_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                if conn.dialect.name == "postgresql":
                    await conn.execute(text("ALTER TABLE items ENABLE ROW LEVEL SECURITY;"))
                    await conn.execute(text("ALTER TABLE items FORCE ROW LEVEL SECURITY;"))
                    await conn.execute(text("DROP POLICY IF EXISTS tenant_isolation_policy ON items;"))
                    await conn.execute(text("""
                        CREATE POLICY tenant_isolation_policy ON items
                        FOR ALL
                        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''))
                        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''));
                    """))
        except Exception as err:
            err_str = str(err).lower()
            # Only ignore expected permission errors if tables/RLS were already configured by migrations/admin
            if "must be owner" in err_str or "insufficientprivilege" in err_str or "permission denied" in err_str:
                pass
            else:
                raise
        finally:
            await setup_engine.dispose()

    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(test_engine):
    session_maker = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
        await session.rollback()

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def setup_tenants(db_session):
    tenant_a = await db_session.get(Tenant, "tenant-a-111")
    if not tenant_a:
        tenant_a = Tenant(id="tenant-a-111", name="Acme Corp", slug="acme")
        db_session.add(tenant_a)
    tenant_b = await db_session.get(Tenant, "tenant-b-222")
    if not tenant_b:
        tenant_b = Tenant(id="tenant-b-222", name="Beta Corp", slug="beta")
        db_session.add(tenant_b)
    await db_session.commit()
    await db_session.refresh(tenant_a)
    await db_session.refresh(tenant_b)

    token_a = create_access_token(user_id="user-a-1", email="alice@acme.com", tenant_id="tenant-a-111")
    token_b = create_access_token(user_id="user-b-2", email="bob@beta.com", tenant_id="tenant-b-222")

    return {
        "tenant_a": tenant_a,
        "tenant_b": tenant_b,
        "token_a": token_a,
        "token_b": token_b
    }
