"""End-to-end tests for the SnapShop pipeline, run in mock mode (no API key)."""
import base64
import os

os.environ["MOCK_MODE"] = "true"  # force mock before importing app modules

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.recognition import recognize  # noqa: E402
from app.matching import match  # noqa: E402

client = TestClient(app)

# 1x1 transparent PNG, just to have valid image bytes for the upload test.
_TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def test_health_reports_mock():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["mock_mode"] is True


def test_recognition_returns_structured_item():
    item, used_mock = recognize("ignored-in-mock")
    assert used_mock is True
    assert item.category == "earbuds"
    assert 0.0 <= item.confidence <= 1.0


def test_matching_finds_local_sellers():
    item, _ = recognize("ignored-in-mock")
    sellers = match(item)
    assert len(sellers) >= 1
    # results ranked by score descending
    scores = [s.match_score for s in sellers]
    assert scores == sorted(scores, reverse=True)
    # every match is an earbuds seller in Kigali
    assert all(s.match_score >= 0.5 for s in sellers)
    # matches explain themselves (category/brand/keyword-overlap reasons)
    assert all(s.match_reason for s in sellers)


def test_recognize_endpoint_full_response():
    r = client.post("/recognize", json={"image_base64": "x"})
    assert r.status_code == 200
    body = r.json()
    assert body["mock"] is True
    assert body["item"]["category"] == "earbuds"
    assert isinstance(body["sellers"], list)
    assert len(body["sellers"]) >= 1


def test_upload_endpoint():
    r = client.post(
        "/recognize/upload",
        files={"file": ("test.png", _TINY_PNG, "image/png")},
    )
    assert r.status_code == 200
    assert r.json()["item"]["category"] == "earbuds"


def test_seller_submission_succeeds_without_db():
    r = client.post("/sellers/submit", json={
        "shop_name": "Test Shop", "channel": "shop", "contact": "+250700000000",
        "location": "Kigali", "product": "Test Earbuds", "category": "earbuds",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "received"
    assert body["saved"] is False  # no DATABASE_URL in tests — degrades gracefully


def test_notify_me_succeeds_without_db():
    r = client.post("/notify-me", json={"contact": "+250700000000", "category": "earbuds"})
    assert r.status_code == 200
    assert r.json()["status"] == "received"


def test_feedback_succeeds_without_db():
    r = client.post("/feedback", json={"category": "earbuds", "helpful": True})
    assert r.status_code == 200
    assert r.json()["status"] == "received"


def test_admin_verify_rejects_when_no_token_configured():
    # ADMIN_TOKEN isn't set in tests, so the admin API stays locked by default.
    r = client.post("/admin/verify", headers={"x-admin-token": "anything"})
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_admin_submissions_requires_auth():
    r = client.get("/admin/submissions")
    assert r.status_code == 401


def test_admin_submissions_rejects_wrong_token():
    r = client.get("/admin/submissions", headers={"x-admin-token": "wrong"})
    assert r.status_code == 401


def test_admin_approve_and_reject_require_auth():
    assert client.post("/admin/submissions/1/approve").status_code == 401
    assert client.post("/admin/submissions/1/reject").status_code == 401


def test_list_pending_submissions_empty_without_db():
    from app.admin import list_pending_submissions

    assert list_pending_submissions() == []


def test_approve_and_reject_are_noops_without_db():
    from app.admin import approve_submission, reject_submission

    assert approve_submission(1) is False
    assert reject_submission(1) is False
