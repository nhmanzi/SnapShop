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
                    "id": p.id, "product": p.product, "category": p.category, "brand": p.brand,
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


def update_own_product(
    contact: str, product_id: int, *,
    product: str, category: str, price_rwf: Optional[int],
    photo_attached: bool = False, image_url: Optional[str] = None,
    recognized_category: Optional[str] = None, recognized_brand: Optional[str] = None,
    recognized_model: Optional[str] = None, recognized_keywords: Optional[list] = None,
) -> bool:
    """Edit one of this seller's own live products. Category/brand/model/
    keywords only change together, and only when a new photo was attached —
    resolved the same way approval resolves a new submission — so a bare
    name/price edit can never leave a product's category out of step with
    its (unrelated, still-photo-derived) keywords. image_url is only
    overwritten when the new upload actually succeeded (photo_attached can be
    true with image_url still None if storage isn't configured or the
    upload failed) — recognition runs off the raw photo either way, but a
    failed upload must never blank out the product's existing photo."""
    if not is_db_configured():
        return False
    try:
        from .admin import _resolved_product_fields
        from .db import ensure_tables, get_session
        from .db_models import ProductRow, SellerRow

        ensure_tables(SellerRow, ProductRow)
        with get_session() as session:
            seller = session.query(SellerRow).filter(SellerRow.contact == contact).one_or_none()
            if seller is None:
                return False
            row = session.query(ProductRow).filter(
                ProductRow.id == product_id, ProductRow.seller_id == seller.seller_id,
            ).one_or_none()
            if row is None:
                return False

            row.product = product
            row.price_rwf = price_rwf
            if photo_attached:
                resolved_category, brand, model, keywords = _resolved_product_fields(
                    product, category, recognized_category, recognized_brand,
                    recognized_model, recognized_keywords,
                )
                if image_url is not None:
                    row.image_url = image_url
                row.category = resolved_category
                row.brand = brand
                row.model = model
                row.keywords = keywords
            session.commit()
        return True
    except Exception:
        logger.warning("Could not update product %s", product_id, exc_info=True)
        return False


def delete_own_product(contact: str, product_id: int) -> bool:
    """Remove one of this seller's own live products. No admin review needed
    to take a listing down — only to add or change what it claims."""
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import ProductRow, SellerRow

        ensure_tables(SellerRow, ProductRow)
        with get_session() as session:
            seller = session.query(SellerRow).filter(SellerRow.contact == contact).one_or_none()
            if seller is None:
                return False
            row = session.query(ProductRow).filter(
                ProductRow.id == product_id, ProductRow.seller_id == seller.seller_id,
            ).one_or_none()
            if row is None:
                return False
            session.delete(row)
            session.commit()
        return True
    except Exception:
        logger.warning("Could not delete product %s", product_id, exc_info=True)
        return False


def update_own_submission(
    contact: str, submission_id: int, *,
    product: str, category: str, price_rwf: Optional[int],
    photo_attached: bool = False, image_url: Optional[str] = None,
    recognized_category: Optional[str] = None, recognized_brand: Optional[str] = None,
    recognized_model: Optional[str] = None, recognized_keywords: Optional[list] = None,
) -> bool:
    """Edit one of this seller's own pending/rejected submissions. A rejected
    one moves back to pending for re-review; a pending one just stays pending."""
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerSubmissionRow

        ensure_tables(SellerSubmissionRow)
        with get_session() as session:
            row = session.query(SellerSubmissionRow).filter(
                SellerSubmissionRow.id == submission_id, SellerSubmissionRow.contact == contact,
            ).one_or_none()
            if row is None or row.status not in ("pending", "rejected"):
                return False

            row.product = product
            row.category = category
            row.price_rwf = price_rwf
            if photo_attached:
                if image_url is not None:
                    row.image_url = image_url
                row.recognized_category = recognized_category
                row.recognized_brand = recognized_brand
                row.recognized_model = recognized_model
                row.recognized_keywords = recognized_keywords
            row.status = "pending"
            session.commit()
        return True
    except Exception:
        logger.warning("Could not update submission %s", submission_id, exc_info=True)
        return False


def delete_own_submission(contact: str, submission_id: int) -> bool:
    """Remove one of this seller's own pending/rejected submissions."""
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerSubmissionRow

        ensure_tables(SellerSubmissionRow)
        with get_session() as session:
            row = session.query(SellerSubmissionRow).filter(
                SellerSubmissionRow.id == submission_id, SellerSubmissionRow.contact == contact,
            ).one_or_none()
            if row is None or row.status not in ("pending", "rejected"):
                return False
            session.delete(row)
            session.commit()
        return True
    except Exception:
        logger.warning("Could not delete submission %s", submission_id, exc_info=True)
        return False
