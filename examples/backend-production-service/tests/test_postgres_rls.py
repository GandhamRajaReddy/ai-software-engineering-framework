import os
import pytest
from sqlalchemy import text
from app.models.base import generate_uuidv7
from app.models.tenant import Tenant
from app.models.item import Item

@pytest.mark.asyncio
async def test_postgresql_row_level_security_enforcement(db_session):
    """
    Validates PostgreSQL Row-Level Security (RLS) as an immutable defense-in-depth boundary.
    When RLS is active:
    1. Even unconstrained 'SELECT * FROM items' queries only return rows matching 'app.current_tenant_id'.
    2. Writes with mismatched tenant IDs are rejected at the database engine level (RLS check violation).
    """
    bind = db_session.bind
    dialect_name = bind.dialect.name if bind else "unknown"

    if dialect_name != "postgresql":
        pytest.skip(f"RLS integration test requires PostgreSQL engine (detected dialect: {dialect_name})")

    tenant_a_id = f"tenant-a-{generate_uuidv7()[:8]}"
    tenant_b_id = f"tenant-b-{generate_uuidv7()[:8]}"

    # Insert tenants
    await db_session.execute(
        text("INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES (:id, :name, :slug, true, NOW(), NOW())"),
        [
            {"id": tenant_a_id, "name": "Tenant A", "slug": f"slug-{tenant_a_id}"},
            {"id": tenant_b_id, "name": "Tenant B", "slug": f"slug-{tenant_b_id}"}
        ]
    )

    # Insert Item for Tenant A while setting session tenant context
    await db_session.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_a_id}';"))
    item_a_id = generate_uuidv7()
    await db_session.execute(
        text("INSERT INTO items (id, tenant_id, title, description, version, created_at, updated_at) VALUES (:id, :tid, 'Confidential A', 'Desc', 1, NOW(), NOW())"),
        {"id": item_a_id, "tid": tenant_a_id}
    )

    # Switch session context to Tenant B
    await db_session.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_b_id}';"))
    
    # 1. Verify unconstrained SELECT returns 0 items for Tenant B
    result = await db_session.execute(text("SELECT id, title FROM items;"))
    rows = result.fetchall()
    assert len(rows) == 0, f"RLS leakage! Tenant B saw rows: {rows}"

    # 2. Verify write attempt to inject Tenant A row under Tenant B session is rejected by RLS
    with pytest.raises(Exception) as exc_info:
        await db_session.execute(
            text("INSERT INTO items (id, tenant_id, title, description, version, created_at, updated_at) VALUES (:id, :tid, 'Illegal Cross-Tenant Write', 'Desc', 1, NOW(), NOW())"),
            {"id": generate_uuidv7(), "tid": tenant_a_id}
        )
    assert "row-level security policy" in str(exc_info.value).lower()
