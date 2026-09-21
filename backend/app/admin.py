"""Admin dashboard: submissions review, live catalogue, and unmatched demand.

Approving a submission promotes it into the live sellers/products tables so
it starts feeding into matching immediately; rejecting just marks it as such
for the record. Every read here degrades gracefully when no database is
configured — there is nothing to show without one — and every write is a
safe no-op rather than an error under the same condition.

Access is gated by a single shared token (ADMIN_TOKEN), checked in main.py's
route dependency. If ADMIN_TOKEN is unset, the admin API is fully locked —
that's the safe default rather than leaving it open.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import uuid

from .sellers import is_db_configured

logger = logging.getLogger(__name__)

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")


def admin_enabled() -> bool:
    return bool(ADMIN_TOKEN)


def check_token(token: str) -> bool:
    # Constant-time compare — a naive == leaks how many leading characters
    # matched through response timing.
    return admin_enabled() and secrets.compare_digest(token, ADMIN_TOKEN)


def _submission_to_dict(r) -> dict:
    return {
        "id": r.id,
        "shop_name": r.shop_name,
        "channel": r.channel,
        "contact": r.contact,
        "location": r.location,
        "product": r.product,
        "category": r.category,
        "price_rwf": r.price_rwf,
        "image_url": r.image_url,
        "recognized_category": r.recognized_category,
        "recognized_brand": r.recognized_brand,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def list_submissions(status: str = "pending") -> list[dict]:
    """Submissions with the given status (pending / approved / rejected), oldest first."""
    if not is_db_configured():
        return []
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerSubmissionRow

        ensure_tables(SellerSubmissionRow)
        with get_session() as session:
            rows = (
                session.query(SellerSubmissionRow)
                .filter(SellerSubmissionRow.status == status)
                .order_by(SellerSubmissionRow.created_at)
                .all()
            )
            return [_submission_to_dict(r) for r in rows]
    except Exception:
        logger.warning("Could not list %s submissions", status, exc_info=True)
        return []


def _keywords_for(product: str, category: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", f"{product} {category}".lower())
    return sorted({w for w in words if len(w) > 1})


def _resolved_product_fields(
    product: str, category: str,
    recognized_category: str | None, recognized_brand: str | None,
    recognized_model: str | None, recognized_keywords: list[str] | None,
) -> tuple[str, str | None, str | None, list[str]]:
    """What actually goes live for an approved product: prefer whatever was
    recognized from the seller's own photo (category, brand, model, keywords)
    over the seller's typed text, since that's what a buyer's scan is
    compared against and keeps both sides of a match in the same vocabulary.
    Falls back to the typed text when no photo was recognized (no photo,
    mock mode, or a failed recognition call at submission time)."""
    resolved_category = recognized_category or category
    keywords = sorted(set(_keywords_for(product, category)) | set(recognized_keywords or []))
    return resolved_category, recognized_brand, recognized_model, keywords


def approve_submission(submission_id: int) -> bool:
    """Move a pending submission into the live catalogue.

    Reuses an existing seller (matched by contact) if the same seller has
    submitted before, otherwise creates a new one. The product's category,
    brand, model, and keywords are resolved via _resolved_product_fields,
    which prefers what recognition saw in the seller's own photo.
    """
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import ProductRow, SellerRow, SellerSubmissionRow

        ensure_tables(SellerSubmissionRow, SellerRow, ProductRow)
        with get_session() as session:
            sub = session.get(SellerSubmissionRow, submission_id)
            if sub is None or sub.status != "pending":
                return False

            seller = (
                session.query(SellerRow)
                .filter(SellerRow.contact == sub.contact)
                .one_or_none()
            )
            if seller is None:
                seller = SellerRow(
                    seller_id=f"s-{uuid.uuid4().hex[:8]}",
                    name=sub.shop_name,
                    channel=sub.channel,
                    location=sub.location,
                    contact=sub.contact,
                )
                session.add(seller)
                session.flush()  # assign seller_id before the product references it

            category, brand, model, keywords = _resolved_product_fields(
                sub.product, sub.category,
                sub.recognized_category, sub.recognized_brand,
                sub.recognized_model, sub.recognized_keywords,
            )
            session.add(ProductRow(
                seller_id=seller.seller_id,
                product=sub.product,
                category=category,
                brand=brand,
                model=model,
                keywords=keywords,
                price_rwf=sub.price_rwf,
                image_url=sub.image_url,
            ))
            sub.status = "approved"
            session.commit()
        return True
    except Exception:
        logger.warning("Could not approve submission %s", submission_id, exc_info=True)
        return False


def reject_submission(submission_id: int) -> bool:
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerSubmissionRow

        ensure_tables(SellerSubmissionRow)
        with get_session() as session:
            sub = session.get(SellerSubmissionRow, submission_id)
            if sub is None or sub.status != "pending":
                return False
            sub.status = "rejected"
            session.commit()
        return True
    except Exception:
        logger.warning("Could not reject submission %s", submission_id, exc_info=True)
        return False


def list_live_sellers() -> list[dict]:
    """Every seller currently in the database, with their products.

    This reflects the real catalogue as it stands in Supabase — it does not
    include the built-in seed sellers, since those aren't database rows and
    aren't something the admin manages; it exists only to see what real,
    approved data has accumulated.
    """
    if not is_db_configured():
        return []
    try:
        from .db import ensure_tables, get_session
        from .db_models import ProductRow, SellerRow

        ensure_tables(SellerRow, ProductRow)
        with get_session() as session:
            sellers = session.query(SellerRow).order_by(SellerRow.name).all()
            return [
                {
                    "seller_id": s.seller_id,
                    "name": s.name,
                    "channel": s.channel,
                    "location": s.location,
                    "contact": s.contact,
                    "products": [
                        {
                            "product": p.product,
                            "category": p.category,
                            "brand": p.brand,
                            "model": p.model,
                            "price_rwf": p.price_rwf,
                            "image_url": p.image_url,
                        }
                        for p in s.products
                    ],
                }
                for s in sellers
            ]
    except Exception:
        logger.warning("Could not list live sellers", exc_info=True)
        return []


def get_summary_counts() -> dict:
    """Cheap counts for the dashboard's stat cards — no row bodies fetched."""
    zeros = {"pending": 0, "approved": 0, "rejected": 0, "sellers": 0, "demand": 0}
    if not is_db_configured():
        return zeros
    try:
        from .db import ensure_tables, get_session
        from .db_models import NotifyRequestRow, SellerRow, SellerSubmissionRow

        ensure_tables(SellerSubmissionRow, SellerRow, NotifyRequestRow)
        with get_session() as session:
            q = session.query(SellerSubmissionRow)
            return {
                "pending": q.filter(SellerSubmissionRow.status == "pending").count(),
                "approved": q.filter(SellerSubmissionRow.status == "approved").count(),
                "rejected": q.filter(SellerSubmissionRow.status == "rejected").count(),
                "sellers": session.query(SellerRow).count(),
                "demand": session.query(NotifyRequestRow).count(),
            }
    except Exception:
        logger.warning("Could not compute summary counts", exc_info=True)
        return zeros


def list_notify_requests() -> list[dict]:
    """Unmatched-demand signals — items a shopper looked for but couldn't find, newest first."""
    if not is_db_configured():
        return []
    try:
        from .db import ensure_tables, get_session
        from .db_models import NotifyRequestRow

        ensure_tables(NotifyRequestRow)
        with get_session() as session:
            rows = (
                session.query(NotifyRequestRow)
                .order_by(NotifyRequestRow.created_at.desc())
                .all()
            )
            return [
                {
                    "id": r.id,
                    "contact": r.contact,
                    "category": r.category,
                    "brand": r.brand,
                    "note": r.note,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
    except Exception:
        logger.warning("Could not list notify requests", exc_info=True)
        return []
