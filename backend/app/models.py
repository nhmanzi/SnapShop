"""Data models shared across the SnapShop backend."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class RecognizedItem(BaseModel):
    """The structured identity of an item, returned by the recognition layer."""
    category: str = Field(..., description="Broad product category, e.g. 'earbuds'")
    brand: Optional[str] = Field(None, description="Likely brand if identifiable")
    model: Optional[str] = Field(None, description="Likely model if identifiable")
    attributes: list[str] = Field(default_factory=list, description="Short descriptive tags")
    visible_text: Optional[str] = Field(None, description="Any text/label read from the image")
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Model's confidence 0-1")


class SellerMatch(BaseModel):
    """A local seller that stocks (or likely stocks) the recognized item."""
    seller_id: str
    name: str
    channel: str            # "shop", "instagram", "whatsapp", "marketplace"
    location: str
    contact: str
    price_rwf: Optional[int] = None
    match_score: float = 0.0
    match_reason: Optional[str] = None
    matched_product: Optional[str] = None


class RecognizeResponse(BaseModel):
    """The full response: what the item is + where to buy it locally."""
    item: RecognizedItem
    sellers: list[SellerMatch]
    mock: bool = False       # True when recognition ran in mock mode


class SellerSubmission(BaseModel):
    """A seller-submitted listing, awaiting review before it feeds into matching."""
    shop_name: str
    channel: str            # "shop", "instagram", "whatsapp", "marketplace"
    contact: str
    location: str
    product: str
    category: str
    price_rwf: Optional[int] = None


class NotifyRequest(BaseModel):
    """A demand signal captured when a scan finds no local seller match."""
    contact: str
    category: Optional[str] = None
    brand: Optional[str] = None
    note: Optional[str] = None


class FeedbackRequest(BaseModel):
    """Was a recognition + match result actually correct/useful?"""
    category: Optional[str] = None
    brand: Optional[str] = None
    confidence: Optional[float] = None
    helpful: bool
    note: Optional[str] = None
