from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Text, ForeignKey, Integer, Index
from app.models.base import Base, TimestampMixin, generate_uuidv7

class Item(Base, TimestampMixin):
    __tablename__ = "items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuidv7)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    tenant = relationship("Tenant", back_populates="items")

    __table_args__ = (
        Index("ix_items_tenant_id_title", "tenant_id", "title"),
    )

    # Native SQLAlchemy Optimistic Concurrency Control
    # Automatically appends `AND version = :version` to UPDATE queries
    # and raises StaleDataError if the row was concurrently modified.
    __mapper_args__ = {
        "version_id_col": version
    }
