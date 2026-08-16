"""SQLAlchemy models mirroring the Supabase schema for sellers/products.

Only imported lazily (see app.sellers) when a database is actually in use.
"""
from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String
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
