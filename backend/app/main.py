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

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .admin import approve_submission, check_token, list_pending_submissions, reject_submission
from .community import save_feedback, save_notify_request, save_seller_submission
from .matching import match
from .models import AdminSubmission, FeedbackRequest, NotifyRequest, RecognizeResponse, SellerSubmission
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


@app.post("/sellers/submit")
def submit_seller(req: SellerSubmission) -> dict:
    """List a shop — reviewed before it feeds into live matching."""
    saved = save_seller_submission(req)
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
def admin_list_submissions() -> list[dict]:
    """Seller listings awaiting review, oldest first."""
    return list_pending_submissions()


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
