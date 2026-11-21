import os
import pytest
from sqlalchemy import text
from app.models.base import generate_uuidv7
from app.core.security import create_access_token

@pytest.mark.asyncio
async def test_postgresql_row_level_security_enforcement(db_session):
    """
    Validates PostgreSQL Row-Level Security (RLS) as an immutable database-level boundary.
    When RLS is active:
    1. Even unconstrained 'SELECT * FROM items' queries only return rows matching 'app.current_tenant_id'.
    2. Writes with mismatched tenant IDs are rejected at the database engine level (RLS check violation).
    """
    bind = db_session.bind
    dialect_name = bind.dialect.name if bind else "unknown"

    if dialect_name != "postgresql":
        pytest.skip(f"RLS engine test requires PostgreSQL (detected dialect: {dialect_name})")

    # Verify that FORCE ROW LEVEL SECURITY is strictly enabled on the items table
    rls_check = await db_session.execute(text("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'items';"))
    rls_row = rls_check.fetchone()
    if rls_row:
        assert rls_row[0] is True, "Table 'items' must have relrowsecurity enabled"
        assert rls_row[1] is True, "Table 'items' must have relforcerowsecurity enabled (FORCE RLS)"

    # Verify that non-superuser application role does not have bypassrls or superuser
    user_check = await db_session.execute(text("SELECT CURRENT_USER, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER;"))
    user_row = user_check.fetchone()
    if user_row and user_row[0] == "app_user":
        assert user_row[1] is False, "Role 'app_user' must not have rolsuper"
        assert user_row[2] is False, "Role 'app_user' must not have rolbypassrls"

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
    await db_session.execute(text(f"SELECT set_config('app.current_tenant_id', '{tenant_a_id}', true);"))
    item_a_id = generate_uuidv7()
    await db_session.execute(
        text("INSERT INTO items (id, tenant_id, title, description, version, created_at, updated_at) VALUES (:id, :tid, 'Confidential A', 'Desc', 1, NOW(), NOW())"),
        {"id": item_a_id, "tid": tenant_a_id}
    )

    # Switch session context to Tenant B
    await db_session.execute(text(f"SELECT set_config('app.current_tenant_id', '{tenant_b_id}', true);"))
    
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

@pytest.mark.asyncio
async def test_api_requests_with_postgresql_rls_context(client, setup_tenants, db_session):
    """
    Validates that authenticated API requests properly set transaction-local RLS tenant context.
    Tests end-to-end API path with real PostgreSQL RLS.
    """
    bind = db_session.bind
    dialect_name = bind.dialect.name if bind else "unknown"
    if dialect_name != "postgresql":
        pytest.skip(f"API RLS test requires PostgreSQL (detected dialect: {dialect_name})")

    token_a = setup_tenants["token_a"]
    token_b = setup_tenants["token_b"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. Tenant A creates item via API
    res = await client.post(
        "/api/v1/items",
        json={"title": "RLS Shielded Item", "description": "Guaranteed isolated"},
        headers=headers_a
    )
    assert res.status_code == 201
    item_id = res.json()["id"]

    # 2. Tenant B cannot see item via API
    res_b = await client.get(f"/api/v1/items/{item_id}", headers=headers_b)
    assert res_b.status_code == 404

    # 3. Direct unconstrained SQL query under Tenant B's RLS session context returns 0 rows
    await db_session.execute(text(f"SELECT set_config('app.current_tenant_id', 'tenant-b-222', true);"))
    leak_check = await db_session.execute(text(f"SELECT * FROM items WHERE id = '{item_id}';"))
    assert leak_check.fetchone() is None
