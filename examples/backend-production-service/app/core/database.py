from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
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
        try:
            yield session
        finally:
            await session.close()
