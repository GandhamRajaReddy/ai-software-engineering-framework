import pytest

@pytest.mark.asyncio
async def test_tenant_isolation_boundary(client, setup_tenants):
    """
    Critical Security Regression Test:
    Ensures Tenant B cannot read, update, or delete items owned by Tenant A.
    """
    headers_a = {"X-Tenant-ID": "tenant-a-111"}
    headers_b = {"X-Tenant-ID": "tenant-b-222"}

    # 1. Tenant A creates an item
    create_res = await client.post(
        "/api/v1/items",
        json={"title": "Confidential Strategic Blueprint", "description": "Top secret"},
        headers=headers_a
    )
    assert create_res.status_code == 201
    item_id = create_res.json()["id"]

    # 2. Tenant B attempts to read Tenant A's item -> Must return 404
    get_res = await client.get(f"/api/v1/items/{item_id}", headers=headers_b)
    assert get_res.status_code == 404
    assert get_res.json()["detail"] == "Item not found"

    # 3. Tenant B lists items -> Must NOT contain Tenant A's item
    list_res = await client.get("/api/v1/items", headers=headers_b)
    assert list_res.status_code == 200
    tenant_b_items = list_res.json()
    assert all(item["id"] != item_id for item in tenant_b_items)

    # 4. Tenant B attempts to update Tenant A's item -> Must return 404
    update_res = await client.put(
        f"/api/v1/items/{item_id}",
        json={"title": "Unauthorized Modification"},
        headers=headers_b
    )
    assert update_res.status_code == 404

    # 5. Tenant B attempts to delete Tenant A's item -> Must return 404
    del_res = await client.delete(f"/api/v1/items/{item_id}", headers=headers_b)
    assert del_res.status_code == 404

    # 6. Verify Tenant A can still access their item intact
    verify_res = await client.get(f"/api/v1/items/{item_id}", headers=headers_a)
    assert verify_res.status_code == 200
    assert verify_res.json()["title"] == "Confidential Strategic Blueprint"
