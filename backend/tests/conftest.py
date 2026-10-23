import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import get_session
from app.main import app
from app.models import Base
from app.rate_limit import limit_login, limit_signup


@pytest_asyncio.fixture
async def client():
    database_url = os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://schoolos:schoolos-local-test-only@localhost:5433/schoolos_test",
    )
    engine = create_async_engine(database_url, pool_pre_ping=True)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_session():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    async def allow_test_rate_limit():
        return None
    app.dependency_overrides[limit_signup] = allow_test_rate_limit
    app.dependency_overrides[limit_login] = allow_test_rate_limit
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()
