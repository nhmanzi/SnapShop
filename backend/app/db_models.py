"""SQLAlchemy models mirroring the Supabase schema for sellers/products.

Only imported lazily (see app.sellers) when a database is actually in use.
"""
from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship

from .db import Base


class SellerRow(Base):
    __tablename__ = "sellers"

    seller_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    channel = Column(String, nullable=False)
    location = Column(String, nullable=False)
    contact = Column(String, nullable=False)

    products = relationship("ProductRow", back_populates="seller", cascade="all, delete-orphan")


class ProductRow(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    seller_id = Column(String, ForeignKey("sellers.seller_id"), nullable=False)
    product = Column(String, nullable=False)
    category = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    model = Column(String, nullable=True)
    keywords = Column(ARRAY(String), default=list)
    price_rwf = Column(Integer, nullable=True)

    seller = relationship("SellerRow", back_populates="products")


class SellerSubmissionRow(Base):
    """A seller-submitted listing awaiting review — does not feed into matching directly."""
    __tablename__ = "seller_submissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    shop_name = Column(String, nullable=False)
    channel = Column(String, nullable=False)
    contact = Column(String, nullable=False)
    location = Column(String, nullable=False)
    product = Column(String, nullable=False)
    category = Column(String, nullable=False)
    price_rwf = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NotifyRequestRow(Base):
    """A demand signal captured when a scan finds no local seller match."""
    __tablename__ = "notify_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    contact = Column(String, nullable=False)
    category = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FeedbackRow(Base):
    """User feedback on whether a recognition + match result was correct/useful."""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    helpful = Column(Boolean, nullable=False)
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
