"use client";

import { useEffect, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/+$/, "");
const TOKEN_KEY = "snapshop_admin_token";
const THEME_KEY = "snapshop_admin_theme";

const ICONS = {
  pending: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  ),
  approved: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  rejected: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  catalog: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  demand: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
};

const STAT_CARDS = [
  { id: "pending", countKey: "pending", label: "Pending", color: "#F5A623" },
  { id: "approved", countKey: "approved", label: "Approved", color: "#2FA65A" },
  { id: "rejected", countKey: "rejected", label: "Rejected", color: "#C0392B" },
  { id: "catalog", countKey: "sellers", label: "Live Sellers", color: "#15171E" },
  { id: "demand", countKey: "demand", label: "Unmatched Demand", color: "#6B6E77" },
];

function money(n) {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [authError, setAuthError] = useState("");

  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState("pending");
  const [summary, setSummary] = useState({ pending: 0, approved: 0, rejected: 0, sellers: 0, demand: 0 });
  const [submissions, setSubmissions] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [demand, setDemand] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) setTheme(savedTheme);
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      verify(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authed) {
      loadSummary(token);
      loadTab(tab, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authed]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthed(false);
    setToken("");
  }

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

  async function authedFetch(path, candidate) {
    const res = await fetch(API_BASE + path, {
      headers: { "x-admin-token": candidate || token },
    });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      setAuthed(false);
      return null;
    }
    return res.json();
  }

  async function loadSummary(candidate) {
    const body = await authedFetch("/admin/summary", candidate);
    if (body) setSummary(body);
  }

  async function loadTab(which, candidate) {
    setLoading(true);
    try {
      if (which === "pending" || which === "approved" || which === "rejected") {
        const body = await authedFetch(`/admin/submissions?status=${which}`, candidate);
        if (body) setSubmissions(body);
      } else if (which === "catalog") {
        const body = await authedFetch("/admin/sellers", candidate);
        if (body) setSellers(body);
      } else if (which === "demand") {
        const body = await authedFetch("/admin/notify-requests", candidate);
        if (body) setDemand(body);
      }
    } catch {
      // best effort — leave the previous view showing rather than clearing it
    } finally {
      setLoading(false);
    }
  }

  function refreshAll() {
    loadSummary();
    loadTab(tab);
  }

  async function act(id, action) {
    setActionId(id);
    try {
      await fetch(`${API_BASE}/admin/submissions/${id}/${action}`, {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      setSubmissions((subs) => subs.filter((s) => s.id !== id));
      loadSummary();
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
          <p>Enter the admin password to open the dashboard.</p>
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
    <div className="admin-shell" data-theme={theme}>
      <div className="admin-page">
        <div className="admin-header">
          <div className="admin-profile">
            <div className="admin-avatar">A</div>
            <div>
              <div className="admin-profile-name">Admin</div>
              <div className="admin-profile-role">SnapShop dashboard</div>
            </div>
          </div>
          <div className="admin-header-actions">
            <button className="admin-icon-btn" onClick={refreshAll} disabled={loading} aria-label="Refresh">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
              </svg>
            </button>
            <button className="admin-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <button className="admin-logout" onClick={logout}>Log out</button>
          </div>
        </div>

        <div className="admin-stats">
          {STAT_CARDS.map((c) => (
            <button
              key={c.id}
              className={`admin-stat-card${tab === c.id ? " admin-stat-active" : ""}`}
              onClick={() => setTab(c.id)}
            >
              <div className="admin-stat-icon" style={{ background: c.color }}>{ICONS[c.id]}</div>
              <div className="admin-stat-value">{summary[c.countKey]}</div>
              <div className="admin-stat-label">{c.label}</div>
            </button>
          ))}
        </div>

        {(tab === "pending" || tab === "approved" || tab === "rejected") && (
          <>
            {!loading && submissions.length === 0 && (
              <p className="admin-empty">Nothing here yet.</p>
            )}
            <div className="admin-list">
              {submissions.map((s) => (
                <div className="admin-card" key={s.id}>
                  {s.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image_url} alt={s.product} className="admin-thumb" />
                  )}
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
                  {tab === "pending" && (
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
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "catalog" && (
          <>
            {!loading && sellers.length === 0 && (
              <p className="admin-empty">No sellers in the database yet.</p>
            )}
            <div className="admin-list">
              {sellers.map((s) => (
                <div className="admin-card admin-card-block" key={s.seller_id}>
                  <div className="admin-shop-name">{s.name}</div>
                  <div className="admin-meta">
                    <span className="chan">{s.channel}</span>
                    {s.location} · {s.contact}
                  </div>
                  <div className="admin-catalog-products">
                    {s.products.map((p, i) => (
                      <div className="admin-catalog-product" key={i}>
                        {p.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.product} className="admin-thumb" />
                        )}
                        <div>
                          <div className="admin-product">
                            {p.product} <span className="admin-category">({p.category})</span>
                          </div>
                          {p.price_rwf != null && (
                            <div className="admin-meta">{money(p.price_rwf)} RWF</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "demand" && (
          <>
            {!loading && demand.length === 0 && (
              <p className="admin-empty">No unmatched searches recorded yet.</p>
            )}
            <div className="admin-list">
              {demand.map((d) => (
                <div className="admin-card admin-card-block" key={d.id}>
                  <div className="admin-shop-name">{d.category || "Unknown category"}</div>
                  <div className="admin-meta">
                    {d.brand && <>Brand: {d.brand} · </>}
                    Contact: {d.contact}
                  </div>
                  {d.note && <div className="admin-product">{d.note}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
