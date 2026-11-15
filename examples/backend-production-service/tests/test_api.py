import pytest
from app.models.base import generate_uuidv7

def test_uuidv7_structure_and_monotonicity():
    """Verify generated IDs comply with RFC 9562 UUIDv7 format and time ordering."""
    id1 = generate_uuidv7()
    id2 = generate_uuidv7()
    
    assert len(id1) == 36
    # 13th character represents version 7 ('...-7xxx-...')
    assert id1[14] == '7'
    # 17th character represents variant 1 (8, 9, a, or b)
    assert id1[19] in ['8', '9', 'a', 'b']
    
    # Monotonicity check
    assert id1 <= id2

@pytest.mark.asyncio
async def test_health_probes(client):
    res_liveness = await client.get("/healthz")
    assert res_liveness.status_code == 200
    assert res_liveness.json() == {"status": "ok"}

    res_ready = await client.get("/readyz")
    assert res_ready.status_code == 200
    assert res_ready.json() == {"status": "ready", "database": "connected"}

@pytest.mark.asyncio
async def test_create_get_and_optimistic_concurrency(client, setup_tenants):
    token_a = setup_tenants["token_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # 1. Create item
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

    # 2. Get item
    res_get = await client.get(f"/api/v1/items/{item_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == item_id

    # 3. Successful update with expected_version = 1
    res_upd = await client.put(
        f"/api/v1/items/{item_id}",
        json={"title": "Widget Alpha Updated", "expected_version": 1},
        headers=headers
    )
    assert res_upd.status_code == 200
    updated = res_upd.json()
    assert updated["title"] == "Widget Alpha Updated"
    assert updated["version"] == 2

    # 4. Failed update with stale expected_version = 1 -> Must return 409 Conflict
    res_conflict = await client.put(
        f"/api/v1/items/{item_id}",
        json={"title": "Stale Attempt", "expected_version": 1},
        headers=headers
    )
    assert res_conflict.status_code == 409
    conflict_json = res_conflict.json()
    assert "Optimistic lock conflict" in conflict_json["detail"]

    # 5. Successful update with expected_version = 2
    res_upd2 = await client.put(
        f"/api/v1/items/{item_id}",
        json={"title": "Widget Alpha Final", "expected_version": 2},
        headers=headers
    )
    assert res_upd2.status_code == 200
    assert res_upd2.json()["version"] == 3
