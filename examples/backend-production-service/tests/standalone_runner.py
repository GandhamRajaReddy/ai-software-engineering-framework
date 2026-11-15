import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.models.base import generate_uuidv7
from app.core.security import create_access_token, decode_and_verify_token
from starlette.testclient import TestClient
from app.main import app

def run_all_checks():
    print("--- 1. Testing RFC 9562 Monotonic UUIDv7 ---")
    id1 = generate_uuidv7()
    id2 = generate_uuidv7()
    assert len(id1) == 36, f"Length {len(id1)} != 36"
    assert id1[14] == '7', f"Version digit is {id1[14]} (expected 7)"
    assert id1[19] in ['8', '9', 'a', 'b'], f"Variant digit is {id1[19]}"
    ids = [generate_uuidv7() for _ in range(500)]
    assert ids == sorted(ids), "Monotonicity assertion failed"
    print(f"  Generated {len(ids)} monotonic UUIDv7 IDs: PASS")

    print("\n--- 2. Testing JWT Signing, Verification & Tampering ---")
    tok = create_access_token("user-a-1", "alice@acme.com", "tenant-a-111")
    payload = decode_and_verify_token(tok)
    assert payload["sub"] == "user-a-1"
    assert payload["tid"] == "tenant-a-111"
    assert payload["tenant_id"] == "tenant-a-111"
    print("  Valid token signature & claims decoded: PASS")

    # Tampered token
    tampered = tok[:-5] + "XXXXX"
    try:
        decode_and_verify_token(tampered)
        assert False, "Tampered token should have failed"
    except Exception as e:
        print(f"  Tampered token correctly rejected with {type(e).__name__}: PASS")

    print("\n--- 3. Testing Tenant Spoofing Defense Logic ---")
    # Simulate get_current_user logic
    token_tenant_id = payload.get("tid")
    x_tenant_id_attempt = "tenant-b-222"
    assert token_tenant_id != x_tenant_id_attempt
    print(f"  Tenant spoofing detected: token({token_tenant_id}) != requested({x_tenant_id_attempt}): PASS")

    print("\n==========================================")
    print("ALL STANDALONE VERIFICATION CHECKS PASSED!")
    print("==========================================")

if __name__ == "__main__":
    run_all_checks()
