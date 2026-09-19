"""Admin review: list, approve, and reject seller submissions.

Approving a submission promotes it into the live sellers/products tables so
it starts feeding into matching immediately; rejecting just marks it as such
for the record. Both degrade gracefully when no database is configured —
there is nothing to review without one, so listing returns empty and the
write actions are simply no-ops rather than errors.

Access is gated by a single shared token (ADMIN_TOKEN), checked in main.py's
route dependency. If ADMIN_TOKEN is unset, the admin API is fully locked —
that's the safe default rather than leaving it open.
"""
from __future__ import annotations

import logging
import os
import re
import uuid

from .sellers import is_db_configured

logger = logging.getLogger(__name__)

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")


def admin_enabled() -> bool:
    return bool(ADMIN_TOKEN)


def check_token(token: str) -> bool:
    return admin_enabled() and token == ADMIN_TOKEN


def list_pending_submissions() -> list[dict]:
    if not is_db_configured():
        return []
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerSubmissionRow

        ensure_tables(SellerSubmissionRow)
        with get_session() as session:
            rows = (
                session.query(SellerSubmissionRow)
                .filter(SellerSubmissionRow.status == "pending")
                .order_by(SellerSubmissionRow.created_at)
                .all()
            )
            return [
                {
                    "id": r.id,
                    "shop_name": r.shop_name,
                    "channel": r.channel,
                    "contact": r.contact,
                    "location": r.location,
                    "product": r.product,
                    "category": r.category,
                    "price_rwf": r.price_rwf,
                    "status": r.status,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
    except Exception:
        logger.warning("Could not list pending submissions", exc_info=True)
        return []


def _keywords_for(product: str, category: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", f"{product} {category}".lower())
    return sorted({w for w in words if len(w) > 1})


def approve_submission(submission_id: int) -> bool:
    """Move a pending submission into the live catalogue.

    Reuses an existing seller (matched by contact) if the same seller has
    submitted before, otherwise creates a new one. Keywords for the new
    product are derived automatically from its name and category, since a
    seller filling in the self-service form doesn't curate them by hand.
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

            session.add(ProductRow(
                seller_id=seller.seller_id,
                product=sub.product,
                category=sub.category,
                brand=None,
                model=None,
                keywords=_keywords_for(sub.product, sub.category),
                price_rwf=sub.price_rwf,
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
