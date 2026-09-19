"""Seller identity: register once, log in with contact + PIN.

This exists to fix a specific problem: the old one-shot submission form
asked for shop details on every single product, and any typo or formatting
difference in the contact field (e.g. "+250788123456" vs "0788123456")
made the matching logic in admin.approve_submission think it was a new
seller. Registering once and reusing the stored identity for every
subsequent product removes that risk entirely.

A PIN is not strong authentication — a 4-6 digit code has limited entropy
no matter how it's hashed — but it stops the casual case of someone typing
a seller's already-public phone number and adding or misrepresenting their
listings. PINs are hashed with PBKDF2-HMAC (stdlib, no new dependency),
never stored or returned in plain text.

Every function here degrades the same way the rest of this project does:
no database configured, or a query fails, means "no", not a crash.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from typing import Optional

from .sellers import is_db_configured

logger = logging.getLogger(__name__)

_ITERATIONS = 200_000


def _hash_pin(pin: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, _ITERATIONS).hex()


def register_seller(shop_name: str, channel: str, contact: str, location: str, pin: str) -> tuple[bool, str]:
    """Create a new seller identity. Returns (ok, message)."""
    if not is_db_configured():
        return False, "Registration isn't available right now — try again later."
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerRow

        ensure_tables(SellerRow)
        with get_session() as session:
            existing = session.query(SellerRow).filter(SellerRow.contact == contact).one_or_none()
            if existing is not None:
                return False, "That contact is already registered. Try logging in instead."

            salt = os.urandom(16)
            session.add(SellerRow(
                seller_id=f"s-{uuid.uuid4().hex[:8]}",
                name=shop_name,
                channel=channel,
                location=location,
                contact=contact,
                pin_hash=_hash_pin(pin, salt),
                pin_salt=salt.hex(),
            ))
            session.commit()
        return True, "Registered."
    except Exception:
        logger.warning("Could not register seller", exc_info=True)
        return False, "Something went wrong — try again."


def verify_seller(contact: str, pin: str) -> Optional[dict]:
    """Returns the seller's info if contact+pin match a registered seller, else None."""
    if not contact or not pin or not is_db_configured():
        return None
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerRow

        ensure_tables(SellerRow)
        with get_session() as session:
            seller = session.query(SellerRow).filter(SellerRow.contact == contact).one_or_none()
            if seller is None or not seller.pin_hash or not seller.pin_salt:
                return None
            if _hash_pin(pin, bytes.fromhex(seller.pin_salt)) != seller.pin_hash:
                return None
            return {
                "seller_id": seller.seller_id,
                "name": seller.name,
                "channel": seller.channel,
                "location": seller.location,
                "contact": seller.contact,
            }
    except Exception:
        logger.warning("Could not verify seller", exc_info=True)
        return None


def get_seller_dashboard(contact: str) -> dict:
    """This seller's live products plus every submission they've made, any status."""
    empty = {"products": [], "submissions": []}
    if not is_db_configured():
        return empty
    try:
        from .db import ensure_tables, get_session
        from .db_models import ProductRow, SellerRow, SellerSubmissionRow

        ensure_tables(SellerRow, ProductRow, SellerSubmissionRow)
        with get_session() as session:
            seller = session.query(SellerRow).filter(SellerRow.contact == contact).one_or_none()
            products = [] if seller is None else [
                {
                    "product": p.product, "category": p.category, "brand": p.brand,
                    "model": p.model, "price_rwf": p.price_rwf, "image_url": p.image_url,
                }
                for p in seller.products
            ]

            subs = (
                session.query(SellerSubmissionRow)
                .filter(SellerSubmissionRow.contact == contact)
                .order_by(SellerSubmissionRow.created_at.desc())
                .all()
            )
            submissions = [
                {
                    "id": s.id,
                    "product": s.product,
                    "category": s.category,
                    "price_rwf": s.price_rwf,
                    "image_url": s.image_url,
                    "status": s.status,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in subs
            ]
            return {"products": products, "submissions": submissions}
    except Exception:
        logger.warning("Could not load seller dashboard", exc_info=True)
        return empty
