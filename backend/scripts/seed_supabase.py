"""One-off script: create tables in Supabase and load the seed seller data.

Usage (after setting DATABASE_URL in backend/.env):
    cd backend && python scripts/seed_supabase.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import Base, get_engine, get_session  # noqa: E402
from app.db_models import ProductRow, SellerRow  # noqa: E402
from app.sellers import _SEED_SELLERS  # noqa: E402


def main() -> None:
    if not os.getenv("DATABASE_URL"):
        raise SystemExit("DATABASE_URL is not set in backend/.env — nothing to seed.")

    engine = get_engine()
    Base.metadata.create_all(engine)

    with get_session() as session:
        if session.query(SellerRow).first():
            print("sellers table already has rows — skipping (delete rows first to reseed).")
            return
        for seller in _SEED_SELLERS:
            row = SellerRow(
                seller_id=seller["seller_id"],
                name=seller["name"],
                channel=seller["channel"],
                location=seller["location"],
                contact=seller["contact"],
            )
            row.products = [
                ProductRow(
                    product=p["product"],
                    category=p["category"],
                    brand=p.get("brand"),
                    model=p.get("model"),
                    keywords=p.get("keywords", []),
                    price_rwf=p.get("price_rwf"),
                )
                for p in seller.get("inventory", [])
            ]
            session.add(row)
        session.commit()

    print(f"Seeded {len(_SEED_SELLERS)} sellers into Supabase.")


if __name__ == "__main__":
    main()
