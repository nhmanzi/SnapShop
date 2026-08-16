"""Recognition layer.

Given an image (base64), return a structured RecognizedItem.

- Real mode: calls Claude Haiku vision via the Anthropic Messages API.
- Mock mode: returns a canned, realistic result so the whole pipeline is
  testable with no API key and no network. Enabled when there is no key,
  or when MOCK_MODE=true.

The API key is read from the environment. It is NEVER hard-coded here and
should never be pasted into source or chat.
"""
from __future__ import annotations

import json
import os

from .models import RecognizedItem

MODEL = os.getenv("SNAPSHOP_MODEL", "claude-haiku-4-5-20251001")

# The instruction that forces clean, parseable structured output.
PROMPT = (
    "You are a product identification assistant for a shopping app. "
    "Identify the single main item in this image. "
    "Respond with ONLY a JSON object and nothing else (no markdown, no commentary), "
    "using exactly these keys:\n"
    '{"category": string, "brand": string|null, "model": string|null, '
    '"attributes": [string], "visible_text": string|null, "confidence": number}\n'
    "category is a short lowercase noun (e.g. 'earbuds', 'power bank', 'sneaker'). "
    "attributes are up to 5 short descriptive tags (colour, type, notable features). "
    "confidence is your certainty from 0 to 1. If unsure of brand/model, use null."
)

# Canned response used in mock mode.
_MOCK_ITEM = RecognizedItem(
    category="earbuds",
    brand=None,
    model=None,
    attributes=["wireless", "in-ear", "charging case", "black"],
    visible_text=None,
    confidence=0.82,
)


def _mock_enabled() -> bool:
    if os.getenv("MOCK_MODE", "false").lower() == "true":
        return True
    return not os.getenv("ANTHROPIC_API_KEY")


def _parse_item(raw: str) -> RecognizedItem:
    """Parse the model's text into a RecognizedItem, tolerating stray formatting."""
    text = raw.strip()
    # Strip accidental code fences if the model added them.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    # Grab the outermost JSON object.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    data = json.loads(text)
    return RecognizedItem(
        category=str(data.get("category", "unknown")).lower(),
        brand=data.get("brand") or None,
        model=data.get("model") or None,
        attributes=[str(a) for a in data.get("attributes", [])][:5],
        visible_text=data.get("visible_text") or None,
        confidence=float(data.get("confidence", 0.0)),
    )


def recognize(image_base64: str, media_type: str = "image/jpeg") -> tuple[RecognizedItem, bool]:
    """Identify the item in an image. Returns (item, used_mock)."""
    if _mock_enabled():
        return _MOCK_ITEM.model_copy(deep=True), True

    # Imported lazily so the module (and tests) load without the SDK/key present.
    from anthropic import Anthropic

    client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    message = client.messages.create(
        model=MODEL,
        max_tokens=400,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_base64,
                        },
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )
    raw = "".join(block.text for block in message.content if block.type == "text")
    return _parse_item(raw), False
