import os
import time
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import DateTime, String

class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

_last_ms = 0
_seq = 0

def generate_uuidv7() -> str:
    """
    Generate an RFC 9562 compliant UUIDv7 identifier.
    Structure:
    - 48 bits: Unix epoch timestamp in milliseconds
    - 4 bits: Version 7 (0b0111)
    - 12 bits: Monotonic sub-millisecond sequence counter
    - 2 bits: Variant 1 (0b10)
    - 62 bits: Cryptographic entropy
    Guarantees strict time-ordered monotonicity for B-Tree index efficiency and distributed sorting.
    """
    global _last_ms, _seq
    ms = int(time.time() * 1000)
    if ms <= _last_ms:
        ms = _last_ms
        _seq = (_seq + 1) & 0x0FFF
        if _seq == 0:
            ms += 1
            _last_ms = ms
    else:
        _last_ms = ms
        _seq = 0
    
    ts_bytes = ms.to_bytes(6, byteorder='big')
    b6 = 0x70 | ((_seq >> 8) & 0x0F)
    b7 = _seq & 0xFF
    rand_tail = bytearray(os.urandom(8))
    rand_tail[0] = (rand_tail[0] & 0x3F) | 0x80
    raw = ts_bytes + bytes([b6, b7]) + bytes(rand_tail)
    return str(uuid.UUID(bytes=raw))
