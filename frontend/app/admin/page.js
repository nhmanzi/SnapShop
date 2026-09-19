"use client";

import { useEffect, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/+$/, "");
const TOKEN_KEY = "snapshop_admin_token";

function money(n) {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [authError, setAuthError] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);

  // Try a token already saved in this browser tab's session before asking again.
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      verify(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(candidate) {
    setChecking(true);
    setAuthError("");
    try {
      const res = await fetch(API_BASE + "/admin/verify", {
        method: "POST",
        headers: { "x-admin-token": candidate },
      });
      const body = await res.json();
      if (body.ok) {
        sessionStorage.setItem(TOKEN_KEY, candidate);
        setAuthed(true);
        loadSubmissions(candidate);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
        setAuthError("Wrong password.");
      }
    } catch {
      setAuthError("Could not reach the backend.");
    } finally {
      setChecking(false);
    }
  }

  async function loadSubmissions(candidate) {
    setLoading(true);
    try {
      const res = await fetch(API_BASE + "/admin/submissions", {
        headers: { "x-admin-token": candidate || token },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setAuthed(false);
        return;
      }
      setSubmissions(await res.json());
    } catch {
      // best effort — leave the previous list showing rather than clearing it
    } finally {
      setLoading(false);
    }
  }

  async function act(id, action) {
    setActionId(id);
    try {
      await fetch(`${API_BASE}/admin/submissions/${id}/${action}`, {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      setSubmissions((subs) => subs.filter((s) => s.id !== id));
    } catch {
      // best effort
    } finally {
      setActionId(null);
    }
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    verify(token);
  }

  if (!authed) {
    return (
      <div className="shop-page">
        <div className="shop-card">
          <h1>Admin</h1>
          <p>Enter the admin password to review pending seller listings.</p>
          <form onSubmit={handleLoginSubmit} className="shop-form">
            <label>
              Password
              <input
                type="password"
                required
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button type="submit" className="upload-btn" disabled={checking}>
              {checking ? "Checking…" : "Enter"}
            </button>
            {authError && <p className="shop-error">{authError}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>Pending listings</h1>
        <button className="admin-refresh" onClick={() => loadSubmissions()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!loading && submissions.length === 0 && (
        <p className="admin-empty">Nothing waiting for review.</p>
      )}

      <div className="admin-list">
        {submissions.map((s) => (
          <div className="admin-card" key={s.id}>
            <div className="admin-card-main">
              <div className="admin-shop-name">{s.shop_name}</div>
              <div className="admin-meta">
                <span className="chan">{s.channel}</span>
                {s.location} · {s.contact}
              </div>
              <div className="admin-product">
                {s.product} <span className="admin-category">({s.category})</span>
                {s.price_rwf != null && <> — {money(s.price_rwf)} RWF</>}
              </div>
            </div>
            <div className="admin-actions">
              <button
                className="admin-approve"
                disabled={actionId === s.id}
                onClick={() => act(s.id, "approve")}
              >
                Approve
              </button>
              <button
                className="admin-reject"
                disabled={actionId === s.id}
                onClick={() => act(s.id, "reject")}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
