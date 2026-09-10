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
            {"product": "iPhone 14 Pro Max", "category": "smartphone",
             "brand": "Apple", "model": "iPhone 14 Pro Max",
             "keywords": ["iphone", "apple", "phone", "smartphone"], "price_rwf": 1250000},
            {"product": "Samsung Galaxy A53", "category": "smartphone",
             "brand": "Samsung", "model": "Galaxy A53",
             "keywords": ["samsung", "galaxy", "phone", "smartphone"], "price_rwf": 650000},
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
            {"product": "Dell Latitude 5520 Laptop", "category": "laptop",
             "brand": "Dell", "model": "Latitude 5520",
             "keywords": ["laptop", "dell", "computer"], "price_rwf": 1800000},
            {"product": "iPad Air 5", "category": "tablet",
             "brand": "Apple", "model": "iPad Air 5",
             "keywords": ["ipad", "apple", "tablet"], "price_rwf": 950000},
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
            {"product": "Samsung Galaxy Watch 5", "category": "smartwatch",
             "brand": "Samsung", "model": "Galaxy Watch 5",
             "keywords": ["samsung", "watch", "smartwatch", "fitness"], "price_rwf": 280000},
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
    {
        "seller_id": "s005",
        "name": "Office Supplies Kigali",
        "channel": "shop",
        "location": "Kigali, Remera",
        "contact": "+250 7XX XXX XX5",
        "inventory": [
            {"product": "Pilot G2 Pen (0.7mm)", "category": "pen",
             "brand": "Pilot", "model": "G2",
             "keywords": ["pen", "pilot", "ballpoint"], "price_rwf": 1500},
            {"product": "Oxford Notebook A4", "category": "notebook",
             "brand": "Oxford", "model": "Standard",
             "keywords": ["notebook", "oxford", "stationery"], "price_rwf": 8000},
            {"product": "Book: Python Programming", "category": "book",
             "brand": None, "model": None,
             "keywords": ["book", "python", "programming"], "price_rwf": 35000},
            {"product": "Staedtler Pencil Set", "category": "pencil",
             "brand": "Staedtler", "model": "HB Pencil",
             "keywords": ["pencil", "stationery", "drawing"], "price_rwf": 5000},
        ],
    },
    {
        "seller_id": "s006",
        "name": "@study.hub.kgl",
        "channel": "instagram",
        "location": "Kigali (delivery)",
        "contact": "instagram.com/study.hub.kgl",
        "inventory": [
            {"product": "Scientific Calculator Casio", "category": "calculator",
             "brand": "Casio", "model": "FX-991ES",
             "keywords": ["calculator", "casio", "scientific"], "price_rwf": 25000},
            {"product": "Geometry Set (compass, ruler)", "category": "geometry_set",
             "brand": None, "model": None,
             "keywords": ["geometry", "compass", "ruler", "set"], "price_rwf": 12000},
            {"product": "College Ruled Notebook (100 pages)", "category": "notebook",
             "brand": None, "model": None,
             "keywords": ["notebook", "college", "ruled"], "price_rwf": 6000},
            {"product": "Highlighter Marker Pack", "category": "marker",
             "brand": None, "model": None,
             "keywords": ["highlighter", "marker", "stationery"], "price_rwf": 8000},
        ],
    },
    {
        "seller_id": "s007",
        "name": "Kigali Fashion Hub",
        "channel": "shop",
        "location": "Kigali, Nyarugenge",
        "contact": "+250 7XX XXX XX7",
        "inventory": [
            {"product": "Titan Steel Watch", "category": "watch",
             "brand": "Titan", "model": "Steel Analog",
             "keywords": ["watch", "titan", "analog", "steel"], "price_rwf": 45000},
            {"product": "Fossil Leather Watch", "category": "watch",
             "brand": "Fossil", "model": "Minimalist",
             "keywords": ["watch", "fossil", "leather"], "price_rwf": 85000},
            {"product": "Gold Bracelet (18K)", "category": "bracelet",
             "brand": None, "model": None,
             "keywords": ["bracelet", "gold", "jewelry"], "price_rwf": 150000},
            {"product": "Silver Chain Bracelet", "category": "bracelet",
             "brand": None, "model": None,
             "keywords": ["bracelet", "silver", "chain", "jewelry"], "price_rwf": 35000},
            {"product": "Leather Backpack", "category": "backpack",
             "brand": None, "model": None,
             "keywords": ["backpack", "leather", "bag"], "price_rwf": 95000},
        ],
    },
    {
        "seller_id": "s008",
        "name": "@elegant.accessories",
        "channel": "instagram",
        "location": "Kigali (delivery)",
        "contact": "instagram.com/elegant.accessories",
        "inventory": [
            {"product": "Rose Gold Bracelet Set", "category": "bracelet",
             "brand": None, "model": None,
             "keywords": ["bracelet", "rose gold", "set", "jewelry"], "price_rwf": 55000},
            {"product": "Apple Watch Series 8", "category": "smartwatch",
             "brand": "Apple", "model": "Series 8",
             "keywords": ["apple", "watch", "series 8", "smartwatch"], "price_rwf": 420000},
            {"product": "Crossbody Shoulder Bag", "category": "bag",
             "brand": None, "model": None,
             "keywords": ["bag", "crossbody", "shoulder"], "price_rwf": 75000},
            {"product": "Leather Belt", "category": "belt",
             "brand": None, "model": None,
             "keywords": ["belt", "leather", "accessory"], "price_rwf": 28000},
        ],
    },
    {
        "seller_id": "s009",
        "name": "ElectroMart Kigali",
        "channel": "whatsapp",
        "location": "Kigali, Gikondo",
        "contact": "wa.me/2507XXXXXXX9",
        "inventory": [
            {"product": "iPhone 15 Pro", "category": "smartphone",
             "brand": "Apple", "model": "iPhone 15 Pro",
             "keywords": ["iphone", "apple", "15", "pro"], "price_rwf": 1400000},
            {"product": "Samsung Galaxy Buds 2", "category": "earbuds",
             "brand": "Samsung", "model": "Galaxy Buds 2",
             "keywords": ["samsung", "earbuds", "galaxy", "buds"], "price_rwf": 95000},
            {"product": "USB-C Fast Charger 65W", "category": "charger",
             "brand": None, "model": None,
             "keywords": ["charger", "usb-c", "fast", "65w"], "price_rwf": 18000},
        ],
    },
    {
        "seller_id": "s010",
        "name": "Class Notes & Supplies",
        "channel": "shop",
        "location": "Kigali, Muhima",
        "contact": "+250 7XX XXX XX10",
        "inventory": [
            {"product": "Engineering Notebook (A3)", "category": "notebook",
             "brand": None, "model": None,
             "keywords": ["notebook", "engineering", "a3"], "price_rwf": 12000},
            {"product": "Set Square & Protractor", "category": "geometry_set",
             "brand": None, "model": None,
             "keywords": ["set square", "protractor", "geometry"], "price_rwf": 8500},
            {"product": "Whiteboard Marker (pack of 4)", "category": "marker",
             "brand": None, "model": None,
             "keywords": ["whiteboard", "marker", "pack"], "price_rwf": 10000},
            {"product": "Academic Planner 2026", "category": "planner",
             "brand": None, "model": None,
             "keywords": ["planner", "academic", "organizer"], "price_rwf": 22000},
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
