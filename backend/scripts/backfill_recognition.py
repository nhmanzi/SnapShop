"""One-off backfill: re-run recognition on already-live products that have a
photo but were approved before the matching-engine fix, so their category/
brand/model/keywords come from the actual photo instead of old seller-typed
text. Safe to re-run — skips products it can't fetch or recognize.

Usage:
  python scripts/backfill_recognition.py            # apply
  python scripts/backfill_recognition.py --dry-run  # preview only
"""
from __future__ import annotations

import base64
import sys

import httpx

sys.path.insert(0, ".")

from app.admin import _keywords_for  # noqa: E402
from app.db import get_session  # noqa: E402
from app.db_models import ProductRow  # noqa: E402
from app.recognition import recognize  # noqa: E402
from app.matching import tokens_from_item  # noqa: E402


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    with get_session() as db:
        products = db.query(ProductRow).filter(ProductRow.image_url.isnot(None)).all()
        print(f"Found {len(products)} live product(s) with a photo.\n")

        for p in products:
            print(f"[{p.id}] {p.product!r} — before: category={p.category!r} brand={p.brand!r} model={p.model!r}")
            try:
                resp = httpx.get(p.image_url, timeout=15)
                resp.raise_for_status()
                b64 = base64.standard_b64encode(resp.content).decode("utf-8")
                content_type = resp.headers.get("content-type", "image/jpeg")
                item, used_mock = recognize(b64, content_type)
            except Exception as e:
                print(f"       skipped — could not fetch/recognize: {e}\n")
                continue

            if used_mock:
                print("       skipped — recognition is in mock mode (no real API key)\n")
                continue

            new_keywords = sorted(set(_keywords_for(p.product, p.category)) | tokens_from_item(item))
            print(f"       after:  category={item.category!r} brand={item.brand!r} model={item.model!r}")
            print(f"       keywords: {new_keywords}\n")

            if not dry_run:
                p.category = item.category
                p.brand = item.brand
                p.model = item.model
                p.keywords = new_keywords

        if dry_run:
            print("Dry run — no changes written.")
        else:
            db.commit()
            print("Changes committed.")


if __name__ == "__main__":
    main()
