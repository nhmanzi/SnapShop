"""Community write endpoints: seller submissions, notify-me, and feedback.

All three degrade gracefully: if Supabase isn't configured or a write fails,
the request still succeeds from the user's point of view (no broken UX over
an optional, best-effort save) — it's just not persisted. A warning is logged
so the gap is visible without ever surfacing as a hard failure.
"""
from __future__ import annotations

import logging

from .models import FeedbackRequest, NotifyRequest, SellerSubmission
from .sellers import is_db_configured

logger = logging.getLogger(__name__)


def save_seller_submission(data: SellerSubmission) -> bool:
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import SellerSubmissionRow

        ensure_tables(SellerSubmissionRow)
        with get_session() as session:
            session.add(SellerSubmissionRow(**data.model_dump()))
            session.commit()
        return True
    except Exception:
        logger.warning("Could not save seller submission", exc_info=True)
        return False


def save_notify_request(data: NotifyRequest) -> bool:
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import NotifyRequestRow

        ensure_tables(NotifyRequestRow)
        with get_session() as session:
            session.add(NotifyRequestRow(**data.model_dump()))
            session.commit()
        return True
    except Exception:
        logger.warning("Could not save notify request", exc_info=True)
        return False


def save_feedback(data: FeedbackRequest) -> bool:
    if not is_db_configured():
        return False
    try:
        from .db import ensure_tables, get_session
        from .db_models import FeedbackRow

        ensure_tables(FeedbackRow)
        with get_session() as session:
            session.add(FeedbackRow(**data.model_dump()))
            session.commit()
        return True
    except Exception:
        logger.warning("Could not save feedback", exc_info=True)
        return False
