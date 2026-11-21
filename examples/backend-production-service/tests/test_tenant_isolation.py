import pytest
from app.core.security import create_access_token

@pytest.mark.asyncio
async def test_tenant_isolation_boundary(client, setup_tenants):
    """
    Critical Multi-Tenant Isolation & Authentication Boundary Test.
    1. Authenticated user from Tenant A cannot see, update, or delete Tenant B items.
    2. Tenant ID spoofing attempts via headers are strictly rejected with 403 Forbidden.
    3. Tampered or missing tokens are rejected with 401 Unauthorized.
    """
    token_a = setup_tenants["token_a"]
    token_b = setup_tenants["token_b"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. Unauthenticated request rejected
    unauth_res = await client.get("/api/v1/items")
    assert unauth_res.status_code == 401

    # 2. Tampered token signature rejected
    tampered_headers = {"Authorization": f"Bearer {token_a[:-5]}XXXXX"}
    tampered_res = await client.get("/api/v1/items", headers=tampered_headers)
    assert tampered_res.status_code == 401

    # 3. User A creates an item for Tenant A
    create_res = await client.post(
        "/api/v1/items",
        json={"title": "Confidential Blueprint", "description": "Top Secret"},
        headers=headers_a
    )
    assert create_res.status_code == 201
    item_id = create_res.json()["id"]

    # 4. SPOOFING ATTEMPT: User A attempts to spoof Tenant B by injecting X-Tenant-ID: tenant-b-222
    spoof_headers = {
        "Authorization": f"Bearer {token_a}",
        "X-Tenant-ID": "tenant-b-222"
    }
    spoof_res = await client.post(
        "/api/v1/items",
        json={"title": "Spoofed Item", "description": "Trying to write to tenant B"},
        headers=spoof_headers
    )
    assert spoof_res.status_code == 403
    assert "Tenant identity spoofing detected" in spoof_res.json()["detail"]

    # 5. User B attempts to read Tenant A's item -> Returns 404
    get_res = await client.get(f"/api/v1/items/{item_id}", headers=headers_b)
    assert get_res.status_code == 404

    # 6. User B lists items -> Tenant A's item is not visible
    list_res = await client.get("/api/v1/items", headers=headers_b)
    assert list_res.status_code == 200
    assert all(item["id"] != item_id for item in list_res.json())

    # 7. User B attempts to update Tenant A's item -> Returns 404
    upd_res = await client.put(
        f"/api/v1/items/{item_id}",
        json={"title": "Hacked", "expected_version": 1},
        headers=headers_b
    )
    assert upd_res.status_code == 404

    # 8. User B attempts to delete Tenant A's item -> Returns 404
    del_res = await client.delete(f"/api/v1/items/{item_id}", headers=headers_b)
    assert del_res.status_code == 404

    # 9. Verify Tenant A can still access their item intact
    verify_res = await client.get(f"/api/v1/items/{item_id}", headers=headers_a)
    assert verify_res.status_code == 200
    assert verify_res.json()["title"] == "Confidential Blueprint"

    # 10. Non-existent tenant token rejected with 403 Forbidden
    ghost_token = create_access_token(user_id="user-c", email="carol@ghost.com", tenant_id="tenant-ghost-999")
    ghost_res = await client.get("/api/v1/items", headers={"Authorization": f"Bearer {ghost_token}"})
    assert ghost_res.status_code == 403
    assert "does not exist" in ghost_res.json()["detail"]
