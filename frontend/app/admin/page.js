"use client";

import { useEffect, useRef, useState } from "react";
import { exportTableToPdf } from "../exportPdf";

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

// Case-insensitive substring match across whichever of a row's fields are
// present — used for the free-text search box on every tab.
function rowMatches(row, query, fields) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return fields.some((f) => String(row[f] || "").toLowerCase().includes(q));
}

function SkeletonCards({ count = 3 }) {
  return (
    <div className="admin-list">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skel-card" key={i}>
          <div className="skel skel-card-thumb" />
          <div className="skel-card-lines">
            <div className="skel skel-line w-60" />
            <div className="skel skel-line w-40" />
            <div className="skel skel-line w-80" />
          </div>
        </div>
      ))}
    </div>
  );
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
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({});
  const [actionId, setActionId] = useState(null);
  const [search, setSearch] = useState("");
  const [viewingSeller, setViewingSeller] = useState(null);
  const activeTabRef = useRef(tab);

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
    activeTabRef.current = tab;
    if (authed) {
      loadSummary(token);
      loadTab(tab, token);
    }
    setSearch("");
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
    setSummaryLoaded(true);
  }

  async function loadTab(which, candidate) {
    setLoading(true);
    try {
      if (which === "pending" || which === "approved" || which === "rejected") {
        const body = await authedFetch(`/admin/submissions?status=${which}`, candidate);
        // A slower request for a tab the user has since clicked away from
        // can resolve after a faster one for the tab now on screen — only
        // commit this response if its tab is still the one being viewed.
        if (body && activeTabRef.current === which) setSubmissions(body);
      } else if (which === "catalog") {
        const body = await authedFetch("/admin/sellers", candidate);
        if (body && activeTabRef.current === which) setSellers(body);
      } else if (which === "demand") {
        const body = await authedFetch("/admin/notify-requests", candidate);
        if (body && activeTabRef.current === which) setDemand(body);
      }
      setLoadedTabs((seen) => ({ ...seen, [which]: true }));
    } catch {
      // best effort — leave the previous view showing rather than clearing it
    } finally {
      if (activeTabRef.current === which) setLoading(false);
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
              {summaryLoaded ? (
                <div className="admin-stat-value">{summary[c.countKey]}</div>
              ) : (
                <div className="skel skel-stat-value" />
              )}
              <div className="admin-stat-label">{c.label}</div>
            </button>
          ))}
        </div>

        {(tab === "pending" || tab === "approved" || tab === "rejected") && (
          <>
            {loading && !loadedTabs[tab] ? (
              <SkeletonCards />
            ) : (() => {
                const filtered = submissions.filter((s) => rowMatches(s, search, ["shop_name", "product", "category", "contact"]));
                const tabTitle = tab === "pending" ? "Pending Submissions" : tab === "approved" ? "Approved Submissions" : "Rejected Submissions";
                const exportColumns = [
                  { label: "Shop", value: (s) => s.shop_name },
                  { label: "Channel", value: (s) => s.channel },
                  { label: "Location", value: (s) => s.location },
                  { label: "Contact", value: (s) => s.contact },
                  { label: "Product", value: (s) => s.product },
                  { label: "Category", value: (s) => s.category },
                  { label: "Price (RWF)", value: (s) => (s.price_rwf != null ? money(s.price_rwf) : null) },
                ];
                return (
                  <>
                    <div className="admin-toolbar">
                      <input
                        className="admin-search"
                        placeholder="Search by shop or product…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button
                        className="admin-export-btn"
                        disabled={filtered.length === 0}
                        onClick={() => exportTableToPdf(tabTitle, exportColumns, filtered)}
                      >
                        Export PDF
                      </button>
                    </div>
                    {filtered.length === 0 ? (
                      <p className="admin-empty">{submissions.length === 0 ? "Nothing here yet." : "No matches."}</p>
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th></th>
                              <th>Shop</th>
                              <th>Product</th>
                              <th>Category</th>
                              <th>Price</th>
                              {tab === "pending" && <th></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((s) => (
                              <tr key={s.id}>
                                <td>
                                  {s.image_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={s.image_url} alt={s.product} className="admin-table-thumb" />
                                  )}
                                </td>
                                <td>
                                  <div className="admin-table-name">{s.shop_name}</div>
                                  <div className="admin-meta"><span className="chan">{s.channel}</span>{s.location} · {s.contact}</div>
                                </td>
                                <td>{s.product}</td>
                                <td>
                                  {s.category}
                                  {s.recognized_category && (
                                    <div className="admin-meta">Photo: {s.recognized_category}{s.recognized_brand && <> · {s.recognized_brand}</>}</div>
                                  )}
                                </td>
                                <td>{s.price_rwf != null ? `${money(s.price_rwf)} RWF` : "—"}</td>
                                {tab === "pending" && (
                                  <td>
                                    <div className="admin-table-actions">
                                      <button className="admin-approve" disabled={actionId === s.id} onClick={() => act(s.id, "approve")}>Approve</button>
                                      <button className="admin-reject" disabled={actionId === s.id} onClick={() => act(s.id, "reject")}>Reject</button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
          </>
        )}

        {tab === "catalog" && (
          <>
            {loading && !loadedTabs.catalog ? (
              <SkeletonCards />
            ) : (() => {
                const filtered = sellers.filter((s) => rowMatches(s, search, ["name", "location", "contact"]));
                const exportColumns = [
                  { label: "Seller", value: (s) => s.name },
                  { label: "Channel", value: (s) => s.channel },
                  { label: "Location", value: (s) => s.location },
                  { label: "Contact", value: (s) => s.contact },
                  { label: "Products", value: (s) => s.products.length },
                ];
                return (
                  <>
                    <div className="admin-toolbar">
                      <input
                        className="admin-search"
                        placeholder="Search by seller or location…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button
                        className="admin-export-btn"
                        disabled={filtered.length === 0}
                        onClick={() => exportTableToPdf("Live Sellers", exportColumns, filtered)}
                      >
                        Export PDF
                      </button>
                    </div>
                    {filtered.length === 0 ? (
                      <p className="admin-empty">{sellers.length === 0 ? "No sellers in the database yet." : "No matches."}</p>
                    ) : (
                      <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Seller</th>
                            <th>Channel</th>
                            <th>Location</th>
                            <th>Contact</th>
                            <th>Products</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((s) => (
                            <tr key={s.seller_id}>
                              <td className="admin-table-name">{s.name}</td>
                              <td><span className="chan">{s.channel}</span></td>
                              <td>{s.location}</td>
                              <td>{s.contact}</td>
                              <td>{s.products.length}</td>
                              <td>
                                <button className="admin-row-btn" onClick={() => setViewingSeller(s)}>View more</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </>
                );
              })()}
          </>
        )}

        {tab === "demand" && (
          <>
            {loading && !loadedTabs.demand ? (
              <SkeletonCards />
            ) : (() => {
                const filtered = demand.filter((d) => rowMatches(d, search, ["category", "brand", "contact", "note"]));
                const exportColumns = [
                  { label: "Category", value: (d) => d.category || "Unknown" },
                  { label: "Brand", value: (d) => d.brand },
                  { label: "Contact", value: (d) => d.contact },
                  { label: "Note", value: (d) => d.note },
                ];
                return (
                  <>
                    <div className="admin-toolbar">
                      <input
                        className="admin-search"
                        placeholder="Search by category or contact…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button
                        className="admin-export-btn"
                        disabled={filtered.length === 0}
                        onClick={() => exportTableToPdf("Unmatched Demand", exportColumns, filtered)}
                      >
                        Export PDF
                      </button>
                    </div>
                    {filtered.length === 0 ? (
                      <p className="admin-empty">{demand.length === 0 ? "No unmatched searches recorded yet." : "No matches."}</p>
                    ) : (
                      <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Brand</th>
                            <th>Contact</th>
                            <th>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((d) => (
                            <tr key={d.id}>
                              <td className="admin-table-name">{d.category || "Unknown"}</td>
                              <td>{d.brand || "—"}</td>
                              <td>{d.contact}</td>
                              <td>{d.note || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </>
                );
              })()}
          </>
        )}
      </div>

      {viewingSeller && (
        <div className="modal-overlay" onClick={() => setViewingSeller(null)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{viewingSeller.name}</h2>
            <p className="admin-modal-sub">
              <span className="chan">{viewingSeller.channel}</span> {viewingSeller.location} · {viewingSeller.contact}
            </p>
            {viewingSeller.products.length === 0 ? (
              <p className="admin-empty">No products yet.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Brand</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingSeller.products.map((p, i) => (
                      <tr key={i}>
                        <td>
                          {p.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt={p.product} className="admin-table-thumb" />
                          )}
                        </td>
                        <td className="admin-table-name">{p.product}</td>
                        <td>{p.category}</td>
                        <td>{p.brand || "—"}</td>
                        <td>{p.price_rwf != null ? `${money(p.price_rwf)} RWF` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="shop-link-btn" onClick={() => setViewingSeller(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
