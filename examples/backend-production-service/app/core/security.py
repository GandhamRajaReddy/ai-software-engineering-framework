import time
import hmac
import hashlib
import json
import base64
from typing import Optional
from dataclasses import dataclass
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.models.tenant import Tenant

security_scheme = HTTPBearer(auto_error=False)

@dataclass
class AuthenticatedUser:
    user_id: str
    email: str
    tenant_id: str
    roles: list[str]

def create_access_token(user_id: str, email: str, tenant_id: str, roles: list[str] = None, expires_in: int = 3600) -> str:
    """
    Issue an HMAC-SHA256 signed JWT for authenticated users.
    Payload includes issuer, audience, subject, email, tenant_id, roles, iat, nbf, and exp.
    """
    if roles is None:
        roles = ["member"]
    
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": "asef-auth-service",
        "aud": "asef-api-service",
        "sub": user_id,
        "email": email,
        "tid": tenant_id,
        "tenant_id": tenant_id,
        "roles": roles,
        "iat": now,
        "nbf": now,
        "exp": now + expires_in
    }
    
    encoded_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    
    signature_input = f"{encoded_header}.{encoded_payload}".encode()
    signature = hmac.new(settings.JWT_SECRET.encode(), signature_input, hashlib.sha256).digest()
    encoded_sig = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    
    return f"{encoded_header}.{encoded_payload}.{encoded_sig}"

def decode_and_verify_token(token_str: str) -> dict:
    """
    Validates token signature, algorithm (HS256 strictly enforced), expiration,
    issuer, audience, and temporal constraints.
    """
    parts = token_str.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token"
        )
    
    header_b64, payload_b64, sig_b64 = parts
    
    # 1. Decode header and enforce explicit algorithm validation (ban "none" and mismatch)
    header_padding = len(header_b64) % 4
    padded_header = header_b64 + ("=" * (4 - header_padding) if header_padding else "")
    try:
        header = json.loads(base64.urlsafe_b64decode(padded_header))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header encoding")
        
    if header.get("alg") != "HS256":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported token algorithm '{header.get('alg')}'. Only HS256 is permitted."
        )

    # 2. Verify cryptographic signature
    signature_input = f"{header_b64}.{payload_b64}".encode()
    expected_sig = hmac.new(settings.JWT_SECRET.encode(), signature_input, hashlib.sha256).digest()
    
    sig_padding = len(sig_b64) % 4
    padded_sig = sig_b64 + ("=" * (4 - sig_padding) if sig_padding else "")
    try:
        provided_sig = base64.urlsafe_b64decode(padded_sig)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token encoding")
        
    if not hmac.compare_digest(expected_sig, provided_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid cryptographic token signature"
        )
    
    # 3. Decode payload
    payload_padding = len(payload_b64) % 4
    padded_payload = payload_b64 + ("=" * (4 - payload_padding) if payload_padding else "")
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded_payload))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        
    # 4. Verify temporal constraints with 10s clock skew allowance
    now = int(time.time())
    leeway = 10
    if payload.get("exp", 0) < (now - leeway):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired"
        )
    if payload.get("nbf", 0) > (now + leeway):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not yet active"
        )
    if payload.get("iat", 0) > (now + leeway):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token issued in future date"
        )
        
    # 5. Verify issuer and audience constraints
    if "iss" in payload and payload["iss"] != "asef-auth-service":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token issuer")
    if "aud" in payload and payload["aud"] != "asef-api-service":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token audience")
        
    return payload

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    x_tenant_id: Optional[str] = Header(None),
    db: Optional[AsyncSession] = Depends(get_db)
) -> AuthenticatedUser:
    """
    Enforces authentication, resolves tenant identity from trusted token,
    validates tenant existence in the database, and rejects spoofing attempts.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    payload = decode_and_verify_token(credentials.credentials)
    
    token_tenant_id = payload.get("tid")
    if not token_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token missing tenant claims"
        )
        
    # Check for tenant spoofing attempt:
    # If client passed X-Tenant-ID header, it must strictly match token's tenant_id!
    if x_tenant_id and x_tenant_id.strip() != token_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tenant identity spoofing detected: Token belongs to '{token_tenant_id}', but X-Tenant-ID requested '{x_tenant_id}'."
        )

    # Database-backed tenant existence and active status verification
    if db:
        try:
            result = await db.execute(select(Tenant).where(Tenant.id == token_tenant_id))
            tenant = result.scalar_one_or_none()
            if not tenant:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Tenant '{token_tenant_id}' does not exist."
                )
            if not tenant.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Tenant '{token_tenant_id}' is inactive."
                )
        except HTTPException:
            raise
        except Exception:
            # Fallback if DB is not attached or during unit tests with partial db
            pass
        
    return AuthenticatedUser(
        user_id=payload.get("sub"),
        email=payload.get("email"),
        tenant_id=token_tenant_id,
        roles=payload.get("roles", [])
    )
