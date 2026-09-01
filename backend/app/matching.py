"""Matching engine.

Maps a RecognizedItem to local sellers who stock it (or something close),
producing a ranked list of SellerMatch. This is deliberately simple and
transparent so it is easy to explain and evaluate; you can later swap in
embeddings / fuzzy matching without changing the interface.

Scoring (0..1):
  +0.50  category matches
  +0.30  brand matches (when both known)
  +0.20  keyword/attribute overlap (scaled)
"""
from __future__ import annotations

from .models import RecognizedItem, SellerMatch
from .sellers import get_sellers


def _tokens(item: RecognizedItem) -> set[str]:
    toks = {item.category.lower()}
    for a in item.attributes:
        toks.update(a.lower().split())
    if item.model:
        toks.update(item.model.lower().split())
    if item.visible_text:
        toks.update(item.visible_text.lower().split())
    return {t for t in toks if len(t) > 1}


def _score(item: RecognizedItem, product: dict) -> tuple[float, str]:
    score = 0.0
    reasons = []

    if item.category and item.category.lower() == str(product.get("category", "")).lower():
        score += 0.50
        reasons.append("category")

    if item.brand and product.get("brand") and \
            item.brand.lower() == str(product["brand"]).lower():
        score += 0.30
        reasons.append("brand")

    item_toks = _tokens(item)
    prod_toks = {k.lower() for k in product.get("keywords", [])}
    if prod_toks:
        overlap = len(item_toks & prod_toks) / len(prod_toks)
        score += 0.20 * overlap
        if overlap:
            reasons.append(f"{int(overlap * 100)}% keyword overlap")

    return round(min(score, 1.0), 3), ", ".join(reasons)


def match(item: RecognizedItem, threshold: float = 0.5, limit: int = 5) -> list[SellerMatch]:
    """Return ranked local sellers for the recognized item."""
    results: list[SellerMatch] = []
    for seller in get_sellers():
        best = None
        for product in seller.get("inventory", []):
            s, reason = _score(item, product)
            if best is None or s > best[0]:
                best = (s, reason, product)
        if best and best[0] >= threshold:
            score, reason, product = best
            results.append(SellerMatch(
                seller_id=seller["seller_id"],
                name=seller["name"],
                channel=seller["channel"],
                location=seller["location"],
                contact=seller["contact"],
                price_rwf=product.get("price_rwf"),
                match_score=score,
                match_reason=reason or None,
                matched_product=product.get("product"),
            ))
    results.sort(key=lambda m: m.match_score, reverse=True)
    return results[:limit]
