from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.core.config import settings
from app.models.base import Base

def get_engine():
    try:
        return create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=True
        )
    except Exception:
        return None

engine = get_engine()

if engine:
    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False
    )
else:
    AsyncSessionLocal = None

async def get_db():
    if not AsyncSessionLocal:
        raise RuntimeError("Database engine not initialized. Ensure database drivers (e.g. asyncpg, aiosqlite) are installed.")
    async with AsyncSessionLocal() as session:
        yield session

async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    """
    Sets the transaction-local PostgreSQL tenant identifier for Row-Level Security (RLS).
    Uses set_config(..., is_local=true) so the setting is strictly scoped to the active transaction
    and automatically cleared on commit or rollback by PostgreSQL.
    Dialect-safe: no-op on SQLite or other non-PostgreSQL engines.
    """
    bind = session.bind
    dialect_name = bind.dialect.name if bind else ""
    if dialect_name == "postgresql":
        await session.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
            {"tid": tenant_id}
        )
