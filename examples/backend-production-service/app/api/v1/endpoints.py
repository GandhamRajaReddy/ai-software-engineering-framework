from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user, AuthenticatedUser
from app.models.item import Item
from app.api.v1.schemas import ItemCreate, ItemUpdate, ItemResponse

router = APIRouter(prefix="/items", tags=["items"])

@router.post("", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: ItemCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    item = Item(
        tenant_id=current_user.tenant_id,
        title=payload.title,
        description=payload.description
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item

@router.get("", response_model=list[ItemResponse])
async def list_items(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Item).where(Item.tenant_id == current_user.tenant_id).order_by(Item.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Item).where(Item.id == item_id, Item.tenant_id == current_user.tenant_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item

@router.put("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: str,
    payload: ItemUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Item).where(Item.id == item_id, Item.tenant_id == current_user.tenant_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    # Optimistic Concurrency Control: verify caller's expected version
    if item.version != payload.expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Optimistic lock conflict: Item version is {item.version}, but client expected {payload.expected_version}. Reload and retry."
        )

    if payload.title is not None:
        item.title = payload.title
    if payload.description is not None:
        item.description = payload.description

    try:
        await db.commit()
        await db.refresh(item)
    except StaleDataError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent modification detected. Row version has diverged."
        )

    return item

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Item).where(Item.id == item_id, Item.tenant_id == current_user.tenant_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    await db.delete(item)
    await db.commit()
    return None
