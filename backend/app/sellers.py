"""Local-seller index for SnapShop's first sample space: Kigali gadgets.

Sellers come from Supabase (Postgres) when DATABASE_URL is set and reachable.
Whenever it isn't set, or a query fails, the seed list below is used instead —
so the app (and a live demo) keeps working through a DB outage or missing config.

In production this data is populated by your scraper (LeadHarvest-style) from
local shops and Instagram/WhatsApp sellers, seeded into Supabase.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# NOTE: names, prices and contacts below are fictional placeholders for testing,
# and the fallback used whenever Supabase is unavailable.
_SEED_SELLERS: list[dict] = [
    {
        "seller_id": "s001",
        "name": "Kigali Gadget Hub",
        "channel": "shop",
        "location": "Kigali, City Centre",
        "contact": "+250 7XX XXX XX1",
        "inventory": [
            {"product": "Wireless Earbuds (generic ANC)", "category": "earbuds",
             "brand": None, "model": None,
             "keywords": ["earbuds", "wireless", "anc", "bluetooth"], "price_rwf": 28000},
            {"product": "Anker PowerCore 10000", "category": "power bank",
             "brand": "Anker", "model": "PowerCore 10000",
             "keywords": ["power bank", "anker", "10000mah", "charger"], "price_rwf": 22000},
        ],
    },
    {
        "seller_id": "s002",
        "name": "TechPoint Rwanda",
        "channel": "shop",
        "location": "Kigali, Kimironko",
        "contact": "+250 7XX XXX XX2",
        "inventory": [
            {"product": "JBL Tune Buds", "category": "earbuds",
             "brand": "JBL", "model": "Tune Buds",
             "keywords": ["earbuds", "jbl", "tune", "bluetooth"], "price_rwf": 45000},
            {"product": "Logitech M170 Mouse", "category": "mouse",
             "brand": "Logitech", "model": "M170",
             "keywords": ["mouse", "logitech", "wireless"], "price_rwf": 12000},
        ],
    },
    {
        "seller_id": "s003",
        "name": "@kgl.gadgets",
        "channel": "instagram",
        "location": "Kigali (delivery)",
        "contact": "instagram.com/kgl.gadgets",
        "inventory": [
            {"product": "Wireless Earbuds Pro", "category": "earbuds",
             "brand": None, "model": None,
             "keywords": ["earbuds", "wireless", "pro", "bluetooth", "anc"], "price_rwf": 30000},
            {"product": "Smart Watch D20", "category": "smartwatch",
             "brand": None, "model": "D20",
             "keywords": ["smartwatch", "watch", "fitness"], "price_rwf": 15000},
        ],
    },
    {
        "seller_id": "s004",
        "name": "Boutique Elec Nyabugogo",
        "channel": "whatsapp",
        "location": "Kigali, Nyabugogo",
        "contact": "wa.me/2507XXXXXXX4",
        "inventory": [
            {"product": "Anker Soundcore Life P2", "category": "earbuds",
             "brand": "Anker", "model": "Soundcore Life P2",
             "keywords": ["earbuds", "anker", "soundcore", "bluetooth"], "price_rwf": 38000},
        ],
    },
]

_last_source = "seed"


def is_db_configured() -> bool:
    return bool(os.getenv("DATABASE_URL"))


def sellers_source() -> str:
    """Where the last get_sellers() call actually pulled data from."""
    return _last_source


def _sellers_from_db() -> list[dict]:
    # Imported lazily so this module (and mock-mode/tests) load without
    # sqlalchemy/psycopg2 installed when no DATABASE_URL is set.
    from .db import get_session
    from .db_models import SellerRow

    with get_session() as session:
        rows = session.query(SellerRow).all()
        return [
            {
                "seller_id": s.seller_id,
                "name": s.name,
                "channel": s.channel,
                "location": s.location,
                "contact": s.contact,
                "inventory": [
                    {
                        "product": p.product,
                        "category": p.category,
                        "brand": p.brand,
                        "model": p.model,
                        "keywords": p.keywords or [],
                        "price_rwf": p.price_rwf,
                    }
                    for p in s.products
                ],
            }
            for s in rows
        ]


def get_sellers() -> list[dict]:
    """Return the live seller index: Supabase if configured and reachable, else the seed fallback."""
    global _last_source
    if not is_db_configured():
        _last_source = "seed"
        return _SEED_SELLERS
    try:
        rows = _sellers_from_db()
        _last_source = "supabase" if rows else "seed (empty db)"
        return rows or _SEED_SELLERS
    except Exception:
        logger.warning("Supabase unreachable, falling back to seed sellers", exc_info=True)
        _last_source = "seed (db unreachable)"
        return _SEED_SELLERS
