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


def tokens_from_item(item: RecognizedItem) -> set[str]:
    """Lowercased, deduplicated tokens describing a recognized item — shared
    with the seller-submission flow so a product's keywords are derived the
    same way a buyer's scan is, instead of two different vocabularies."""
    toks = {item.category.lower()}
    for a in item.attributes:
        toks.update(a.lower().split())
    if item.model:
        toks.update(item.model.lower().split())
    if item.visible_text:
        toks.update(item.visible_text.lower().split())
    return {t for t in toks if len(t) > 1}


def _stem(word: str) -> str:
    """Crude word root so plural/-ed forms compare equal:
    bottle / bottles / bottled -> "bottl", earbud / earbuds -> "earbud"."""
    w = word.lower().strip()
    if len(w) > 4 and w.endswith("ies"):
        w = w[:-3] + "y"
    elif len(w) > 4 and w.endswith(("ed", "es")):
        w = w[:-2]
    elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        w = w[:-1]
    if len(w) > 3 and w.endswith("e"):
        w = w[:-1]
    return w


def _norm_phrase(phrase: str) -> str:
    """Order-insensitive stemmed form of a phrase, so "water bottle" and
    "bottled water" normalize to the same string."""
    return " ".join(sorted(_stem(w) for w in str(phrase).split()))


def _score(item: RecognizedItem, product: dict) -> tuple[float, str]:
    score = 0.0
    reasons = []

    if item.category and _norm_phrase(item.category) == _norm_phrase(product.get("category", "")):
        score += 0.50
        reasons.append("category")

    if item.brand and product.get("brand") and \
            item.brand.lower() == str(product["brand"]).lower():
        score += 0.30
        reasons.append("brand")

    item_toks = {_norm_phrase(t) for t in tokens_from_item(item)}
    prod_toks = {_norm_phrase(k) for k in product.get("keywords", []) if str(k).strip()}
    if prod_toks:
        overlap = len(item_toks & prod_toks) / len(prod_toks)
        score += 0.20 * overlap
        if overlap:
            reasons.append(f"{int(overlap * 100)}% keyword overlap")

    return round(min(score, 1.0), 3), ", ".join(reasons)


def match(item: RecognizedItem, threshold: float = 0.5, limit: int = 5,
          min_results: int = 2) -> list[SellerMatch]:
    """Return ranked local sellers for the recognized item.

    Sellers scoring at or above `threshold` are real matches. If fewer than
    `min_results` pass, the list is topped up with the next-closest sellers
    (any score above zero), flagged `similar=True` so the UI can label them.
    """
    scored = []
    for seller in get_sellers():
        best = None
        for product in seller.get("inventory", []):
            s, reason = _score(item, product)
            if best is None or s > best[0]:
                best = (s, reason, product)
        if best:
            scored.append((seller, *best))
    scored.sort(key=lambda r: r[1], reverse=True)

    passed = [r for r in scored if r[1] >= threshold]
    fill = [r for r in scored if 0 < r[1] < threshold][:max(0, min_results - len(passed))]

    results: list[SellerMatch] = []
    for rows, similar in ((passed, False), (fill, True)):
        for seller, score, reason, product in rows:
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
                similar=similar,
            ))
    return results[:max(limit, min_results)]
