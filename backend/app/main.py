"""SnapShop backend API.

Endpoints:
  GET  /health            -> service + mode check
  POST /recognize         -> {image_base64} -> identified item + local sellers
  POST /recognize/upload  -> multipart file upload -> same response

Run locally:
  uvicorn app.main:app --reload
"""
from __future__ import annotations

import base64

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .matching import match
from .models import RecognizeResponse
from .recognition import _mock_enabled, recognize
from .sellers import get_sellers, sellers_source

app = FastAPI(title="SnapShop API", version="0.1.0")

# The frontend is served separately, so allow cross-origin calls in dev.
# Tighten allow_origins to your real frontend URL before any public deploy.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    """API welcome / quick links."""
    return {"name": "SnapShop API", "docs": "/docs", "health": "/health"}


class RecognizeRequest(BaseModel):
    image_base64: str
    media_type: str = "image/jpeg"


@app.get("/health")
def health() -> dict:
    get_sellers()  # touch the seller source so the status below is fresh
    return {
        "status": "ok",
        "mock_mode": _mock_enabled(),
        "sellers_source": sellers_source(),
    }


@app.post("/recognize", response_model=RecognizeResponse)
def recognize_endpoint(req: RecognizeRequest) -> RecognizeResponse:
    item, used_mock = recognize(req.image_base64, req.media_type)
    sellers = match(item)
    return RecognizeResponse(item=item, sellers=sellers, mock=used_mock)


@app.post("/recognize/upload", response_model=RecognizeResponse)
async def recognize_upload(file: UploadFile = File(...)) -> RecognizeResponse:
    raw = await file.read()
    b64 = base64.standard_b64encode(raw).decode("utf-8")
    media_type = file.content_type or "image/jpeg"
    item, used_mock = recognize(b64, media_type)
    sellers = match(item)
    return RecognizeResponse(item=item, sellers=sellers, mock=used_mock)
