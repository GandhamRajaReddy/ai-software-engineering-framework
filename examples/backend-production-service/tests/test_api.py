import pytest

@pytest.mark.asyncio
async def test_health_probes(client):
    res_liveness = await client.get("/healthz")
    assert res_liveness.status_code == 200
    assert res_liveness.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_create_and_get_item(client, setup_tenants):
    headers = {"X-Tenant-ID": "tenant-a-111"}

    # Create item
    res = await client.post(
        "/api/v1/items",
        json={"title": "Widget Alpha", "description": "High performance widget"},
        headers=headers
    )
    assert res.status_code == 201
    created = res.json()
    assert created["title"] == "Widget Alpha"
    assert created["tenant_id"] == "tenant-a-111"
    assert created["version"] == 1
    item_id = created["id"]

    # Get single item
    res_get = await client.get(f"/api/v1/items/{item_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == item_id

    # List items
    res_list = await client.get("/api/v1/items", headers=headers)
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1
