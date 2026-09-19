"""Product photo storage via Supabase Storage's REST API.

Plain HTTP (httpx, already a dependency) rather than the supabase-py client,
so this doesn't add a new dependency to the project. Degrades the same way
everything else here does: if Storage isn't configured, or the upload fails,
the submission still succeeds — it just has no photo attached.

Requires two env vars distinct from DATABASE_URL: SUPABASE_URL (the project's
REST URL, e.g. https://xxxx.supabase.co) and SUPABASE_SERVICE_KEY (the
service role key, from Project Settings -> API). A public "product-photos"
bucket must already exist in the Supabase project — this module uploads
into it but does not create it.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = "product-photos"


def storage_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def upload_product_photo(file_bytes: bytes, content_type: str) -> Optional[str]:
    """Upload a photo, returning its public URL, or None if unconfigured/failed."""
    if not storage_configured():
        return None
    try:
        ext = "jpg" if "jpeg" in content_type else content_type.split("/")[-1]
        path = f"{uuid.uuid4().hex}.{ext}"
        resp = httpx.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
            content=file_bytes,
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": content_type,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    except Exception:
        logger.warning("Could not upload product photo", exc_info=True)
        return None
