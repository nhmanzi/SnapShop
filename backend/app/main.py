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
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .admin import (
    approve_submission,
    check_token,
    get_summary_counts,
    list_live_sellers,
    list_notify_requests,
    list_submissions,
    reject_submission,
)
from .community import save_feedback, save_notify_request, save_seller_submission
from .matching import match
from .models import (
    AdminNotifyRequest,
    AdminSeller,
    AdminSubmission,
    AdminSummary,
    FeedbackRequest,
    NotifyRequest,
    RecognizeResponse,
    SellerDashboard,
    SellerLoginRequest,
    SellerRegisterRequest,
    SellerSubmission,
)
from .recognition import _mock_enabled, recognize
from .seller_auth import get_seller_dashboard, register_seller, verify_seller
from .sellers import get_sellers, sellers_source
from .storage import upload_product_photo

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


@app.post("/sellers/submit")
async def submit_seller(
    shop_name: str = Form(...),
    channel: str = Form(...),
    contact: str = Form(...),
    location: str = Form(...),
    product: str = Form(...),
    category: str = Form(...),
    price_rwf: Optional[int] = Form(None),
    photo: Optional[UploadFile] = File(None),
) -> dict:
    """List a shop — reviewed before it feeds into live matching.

    Multipart rather than JSON so a seller can optionally attach a product
    photo alongside the listing details. A missing or failed photo upload
    never blocks the submission itself — the listing is just saved without one.
    """
    image_url = None
    if photo is not None:
        raw = await photo.read()
        if raw:
            image_url = upload_product_photo(raw, photo.content_type or "image/jpeg")

    data = SellerSubmission(
        shop_name=shop_name, channel=channel, contact=contact, location=location,
        product=product, category=category, price_rwf=price_rwf, image_url=image_url,
    )
    saved = save_seller_submission(data)
    return {"status": "received", "saved": saved}


@app.post("/sellers/register")
def sellers_register(req: SellerRegisterRequest) -> dict:
    """Create a seller identity once, so every later product reuses these details
    instead of being retyped — retyping is what causes duplicate sellers."""
    ok, message = register_seller(req.shop_name, req.channel, req.contact, req.location, req.pin)
    return {"ok": ok, "message": message}


@app.post("/sellers/login", response_model=dict)
def sellers_login(req: SellerLoginRequest) -> dict:
    seller = verify_seller(req.contact, req.pin)
    if seller is None:
        raise HTTPException(status_code=401, detail="Invalid contact or PIN")
    return seller


def require_seller(x_seller_contact: str = Header(default=""), x_seller_pin: str = Header(default="")) -> dict:
    seller = verify_seller(x_seller_contact, x_seller_pin)
    if seller is None:
        raise HTTPException(status_code=401, detail="Invalid contact or PIN")
    return seller


@app.get("/sellers/me", response_model=SellerDashboard)
def sellers_me(seller: dict = Depends(require_seller)) -> dict:
    """Everything the logged-in seller sees about their own shop."""
    data = get_seller_dashboard(seller["contact"])
    return {"seller": seller, **data}


@app.post("/sellers/me/products")
async def sellers_add_product(
    seller: dict = Depends(require_seller),
    product: str = Form(...),
    category: str = Form(...),
    price_rwf: Optional[int] = Form(None),
    photo: Optional[UploadFile] = File(None),
) -> dict:
    """Add another product under the logged-in seller's own identity.

    Shop details come from the verified seller record, not the request —
    the whole point of logging in is to never retype them.
    """
    image_url = None
    if photo is not None:
        raw = await photo.read()
        if raw:
            image_url = upload_product_photo(raw, photo.content_type or "image/jpeg")

    data = SellerSubmission(
        shop_name=seller["name"], channel=seller["channel"], contact=seller["contact"],
        location=seller["location"], product=product, category=category,
        price_rwf=price_rwf, image_url=image_url,
    )
    saved = save_seller_submission(data)
    return {"status": "received", "saved": saved}


@app.post("/notify-me")
def notify_me(req: NotifyRequest) -> dict:
    """Capture demand for an item with no current local match."""
    saved = save_notify_request(req)
    return {"status": "received", "saved": saved}


@app.post("/feedback")
def submit_feedback(req: FeedbackRequest) -> dict:
    """Was a recognition + match result actually correct/useful?"""
    saved = save_feedback(req)
    return {"status": "received", "saved": saved}


def require_admin(x_admin_token: str = Header(default="")) -> None:
    if not check_token(x_admin_token):
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")


@app.post("/admin/verify")
def admin_verify(x_admin_token: str = Header(default="")) -> dict:
    """Let the admin page check a password without exposing anything if it's wrong."""
    return {"ok": check_token(x_admin_token)}


@app.get("/admin/submissions", response_model=list[AdminSubmission], dependencies=[Depends(require_admin)])
def admin_list_submissions(status: str = "pending") -> list[dict]:
    """Seller listings with the given status (pending / approved / rejected), oldest first."""
    if status not in ("pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be pending, approved, or rejected")
    return list_submissions(status)


@app.post("/admin/submissions/{submission_id}/approve", dependencies=[Depends(require_admin)])
def admin_approve(submission_id: int) -> dict:
    """Move a submission into the live seller catalogue."""
    ok = approve_submission(submission_id)
    return {"status": "approved" if ok else "failed"}


@app.post("/admin/submissions/{submission_id}/reject", dependencies=[Depends(require_admin)])
def admin_reject(submission_id: int) -> dict:
    """Discard a submission without adding it to the catalogue."""
    ok = reject_submission(submission_id)
    return {"status": "rejected" if ok else "failed"}


@app.get("/admin/summary", response_model=AdminSummary, dependencies=[Depends(require_admin)])
def admin_summary() -> dict:
    """Counts for the dashboard's stat cards."""
    return get_summary_counts()


@app.get("/admin/sellers", response_model=list[AdminSeller], dependencies=[Depends(require_admin)])
def admin_sellers() -> list[dict]:
    """The live catalogue: real sellers and their products currently in the database."""
    return list_live_sellers()


@app.get("/admin/notify-requests", response_model=list[AdminNotifyRequest], dependencies=[Depends(require_admin)])
def admin_notify_requests() -> list[dict]:
    """Unmatched-demand signals: items shoppers looked for but couldn't find, newest first."""
    return list_notify_requests()
