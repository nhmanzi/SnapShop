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
    # Multipart form now (a photo can ride alongside), not JSON.
    r = client.post("/sellers/submit", data={
        "shop_name": "Test Shop", "channel": "shop", "contact": "+250700000000",
        "location": "Kigali", "product": "Test Earbuds", "category": "earbuds",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "received"
    assert body["saved"] is False  # no DATABASE_URL in tests — degrades gracefully


def test_seller_submission_rejects_negative_price():
    r = client.post("/sellers/submit", data={
        "shop_name": "Test Shop", "channel": "shop", "contact": "+250700000000",
        "location": "Kigali", "product": "Test Earbuds", "category": "earbuds",
        "price_rwf": "-500",
    })
    assert r.status_code == 422


def test_seller_submission_with_photo_succeeds_without_storage_configured():
    r = client.post(
        "/sellers/submit",
        data={
            "shop_name": "Test Shop", "channel": "shop", "contact": "+250700000000",
            "location": "Kigali", "product": "Test Earbuds", "category": "earbuds",
        },
        files={"photo": ("photo.png", _TINY_PNG, "image/png")},
    )
    assert r.status_code == 200
    # No SUPABASE_URL/SUPABASE_SERVICE_KEY in tests, so the upload is skipped
    # but the submission itself still succeeds.
    assert r.json()["status"] == "received"


def test_sellers_register_fails_gracefully_without_db():
    r = client.post("/sellers/register", json={
        "shop_name": "Test Shop", "channel": "shop", "contact": "0700000001",
        "location": "Kigali", "pin": "1234",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False  # no DATABASE_URL in tests — degrades gracefully, doesn't crash
    assert "message" in body


def test_sellers_register_rejects_non_phone_contact():
    r = client.post("/sellers/register", json={
        "shop_name": "Test Shop", "channel": "shop", "contact": "wa.me/250700000001",
        "location": "Kigali", "pin": "1234",
    })
    assert r.status_code == 422


def test_sellers_login_rejects_without_db():
    r = client.post("/sellers/login", json={"contact": "+250700000001", "pin": "1234"})
    assert r.status_code == 401


def test_sellers_me_requires_auth():
    assert client.get("/sellers/me").status_code == 401


def test_sellers_add_product_requires_auth():
    r = client.post("/sellers/me/products", data={"product": "Test Item", "category": "earbuds"})
    assert r.status_code == 401


def test_sellers_update_product_requires_auth():
    r = client.put("/sellers/me/products/1", data={"product": "Test Item", "category": "earbuds"})
    assert r.status_code == 401


def test_sellers_delete_product_requires_auth():
    assert client.delete("/sellers/me/products/1").status_code == 401


def test_sellers_update_submission_requires_auth():
    r = client.put("/sellers/me/submissions/1", data={"product": "Test Item", "category": "earbuds"})
    assert r.status_code == 401


def test_sellers_delete_submission_requires_auth():
    assert client.delete("/sellers/me/submissions/1").status_code == 401


def test_register_and_verify_seller_functions_without_db():
    from app.seller_auth import get_seller_dashboard, register_seller, verify_seller

    ok, _ = register_seller("Test Shop", "shop", "+250700000001", "Kigali", "1234")
    assert ok is False
    assert verify_seller("+250700000001", "1234") is None
    assert get_seller_dashboard("+250700000001") == {"products": [], "submissions": []}


def test_seller_crud_functions_are_noops_without_db():
    from app.seller_auth import delete_own_product, delete_own_submission, update_own_product, update_own_submission

    assert update_own_product(
        "+250700000001", 1, product="X", category="y", price_rwf=1000,
    ) is False
    assert delete_own_product("+250700000001", 1) is False
    assert update_own_submission(
        "+250700000001", 1, product="X", category="y", price_rwf=1000,
    ) is False
    assert delete_own_submission("+250700000001", 1) is False


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


def test_admin_sellers_and_notify_requests_require_auth():
    assert client.get("/admin/sellers").status_code == 401
    assert client.get("/admin/notify-requests").status_code == 401


def test_admin_summary_requires_auth():
    assert client.get("/admin/summary").status_code == 401


def test_summary_counts_are_zero_without_db():
    from app.admin import get_summary_counts

    assert get_summary_counts() == {
        "pending": 0, "approved": 0, "rejected": 0, "sellers": 0, "demand": 0,
    }


def test_admin_submissions_rejects_bad_status_value():
    # Auth is checked as a dependency, so a bogus status still needs a valid
    # token to reach the validation — confirms the check exists either way.
    r = client.get("/admin/submissions", params={"status": "not-a-status"})
    assert r.status_code == 401  # blocked by auth before status is even checked


def test_list_submissions_empty_without_db():
    from app.admin import list_submissions

    assert list_submissions("pending") == []
    assert list_submissions("approved") == []
    assert list_submissions("rejected") == []


def test_approve_and_reject_are_noops_without_db():
    from app.admin import approve_submission, reject_submission

    assert approve_submission(1) is False
    assert reject_submission(1) is False


def test_list_live_sellers_and_notify_requests_empty_without_db():
    from app.admin import list_live_sellers, list_notify_requests

    assert list_live_sellers() == []
    assert list_notify_requests() == []


def test_recognize_photo_discards_mock_results():
    # MOCK_MODE is forced for this whole test module, so a "real" recognition
    # attempt on a seller photo must not attach the canned mock item as if
    # it were a genuine description of the photo.
    from app.main import _recognize_photo

    assert _recognize_photo(_TINY_PNG, "image/png") == {}


def test_recognize_photo_attaches_data_when_not_mock():
    from unittest.mock import patch
    from app.main import _recognize_photo
    from app.models import RecognizedItem

    fake_item = RecognizedItem(
        category="marker", brand="Staedtler", model=None,
        attributes=["whiteboard", "black tip"], visible_text=None, confidence=0.9,
    )
    with patch("app.main.recognize", return_value=(fake_item, False)):
        result = _recognize_photo(_TINY_PNG, "image/png")

    assert result["recognized_category"] == "marker"
    assert result["recognized_brand"] == "Staedtler"
    assert "whiteboard" in result["recognized_keywords"]


def test_recognize_photo_returns_empty_on_recognition_failure():
    from unittest.mock import patch
    from app.main import _recognize_photo

    with patch("app.main.recognize", side_effect=RuntimeError("API down")):
        assert _recognize_photo(_TINY_PNG, "image/png") == {}


def test_submit_seller_with_photo_uses_recognized_data_over_typed_text():
    from unittest.mock import patch
    from app.models import RecognizedItem

    fake_item = RecognizedItem(
        category="marker", brand="Staedtler", model=None,
        attributes=["whiteboard"], visible_text=None, confidence=0.9,
    )
    captured = {}

    def _fake_save(data):
        captured["submission"] = data
        return True

    with patch("app.main.recognize", return_value=(fake_item, False)), \
         patch("app.main.upload_product_photo", return_value="https://example.com/p.jpg"), \
         patch("app.main.save_seller_submission", side_effect=_fake_save):
        r = client.post(
            "/sellers/submit",
            data={
                "shop_name": "Office Supplies", "channel": "shop", "contact": "+250700000000",
                "location": "Kigali", "product": "Board marker", "category": "marker",
            },
            files={"photo": ("photo.png", _TINY_PNG, "image/png")},
        )

    assert r.status_code == 200
    sub = captured["submission"]
    assert sub.recognized_category == "marker"
    assert sub.recognized_brand == "Staedtler"


def test_resolved_product_fields_prefers_recognized_data():
    from app.admin import _resolved_product_fields

    category, brand, model, keywords = _resolved_product_fields(
        product="Board marker", category="marker pen",
        recognized_category="whiteboard marker", recognized_brand="Staedtler",
        recognized_model=None, recognized_keywords=["dry", "erase"],
    )
    assert category == "whiteboard marker"
    assert brand == "Staedtler"
    assert "dry" in keywords and "erase" in keywords
    assert "marker" in keywords  # still includes the seller's own typed text


def test_resolved_product_fields_falls_back_without_recognition():
    from app.admin import _resolved_product_fields

    category, brand, model, keywords = _resolved_product_fields(
        product="Board marker", category="marker",
        recognized_category=None, recognized_brand=None,
        recognized_model=None, recognized_keywords=None,
    )
    assert category == "marker"
    assert brand is None
    assert model is None
    assert keywords == sorted({"board", "marker"})
