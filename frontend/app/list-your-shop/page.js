"use client";

import { useEffect, useState } from "react";
import { exportTableToPdf } from "../exportPdf";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/+$/, "");
const SESSION_KEY = "snapshop_seller_session";

// Downscale to a manageable size before upload — same idea as the scan
// photo, just for a chosen file instead of a live video frame.
async function downscaleImage(file, longEdge = 1024, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function money(n) {
  return n == null ? "—" : n.toLocaleString("en-US");
}

const STATUS_LABEL = { pending: "Pending review", approved: "Live", rejected: "Not approved" };

// Contact is phone-only going forward (fewer formats to confuse buyers with) —
// exactly 10 digits, no spaces or country code, matching the local convention
// already used across seed/live seller data (e.g. 0786369485).
const PHONE_RE = /^\d{10}$/;
function onlyDigits(value) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function EmptyProductsIllustration() {
  return (
    <svg width="140" height="140" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M43.1909 129.308L78.4999 118.244V72.8828L43.1909 83.8615V129.308Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M113.809 129.308L78.5 118.244V72.8828L113.809 83.8615V129.308Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M78.4999 140.464L43.1909 129.4V84.0391L78.4999 95.103V140.464Z" fill="var(--illust-fill-2)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M78.5 140.464L113.809 129.4V84.0391L78.5 95.103V140.464Z" fill="var(--illust-fill-2)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M78.5 72.8864L61.8989 60.4609L26 72.546L43.191 83.8651L78.5 72.8864Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M78.5 72.8864L95.1011 60.4609L131 72.546L113.809 83.8651L78.5 72.8864Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M43.191 84.0391L78.5 95.103L60.8876 106.337L26 94.7625L43.191 84.0391Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M113.809 84.0391L78.5 95.103L96.1124 106.337L131 94.7625L113.809 84.0391Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M88.3515 29.3359C93.2981 42.7603 94.7725 45.7431 95.2564 58.971C95.0703 61.9905 94.9549 65.2739 93.5313 67.9178C91.6302 71.9622 86.9802 74.7632 82.5869 74.8086C78.0609 74.8895 73.6238 72.1183 71.6267 67.8452C70.2216 65.2519 70.2663 61.7046 72.1937 59.3501C74.289 57.0919 77.9752 56.5289 80.6269 57.9399C83.5438 59.2798 85.2848 62.066 85.9297 65.0043C86.5745 67.9427 86.2912 71.1296 85.504 74.0273C83.8578 81.0747 82.4943 81.4157 78.457 93.3474" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeDasharray="4 4" />
      <path d="M94.3716 22.2294C94.3601 24.2034 92.5231 25.4121 90.1936 24.7818C87.7408 24.3637 86.0049 23.9328 85.8931 22.171C85.9494 20.3642 87.9207 19.657 90.228 18.8599C92.9946 17.7605 94.215 20.3004 94.3716 22.2294Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M78.5225 28.2698C79.7656 29.5494 82.3863 29.9225 83.6634 27.9679C85.0637 25.8012 86.2624 24.2259 84.9746 22.7791C83.7315 21.4995 82.5218 22.361 79.7552 23.4603C77.5374 24.5918 77.0667 26.868 78.5225 28.2698Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M84.2584 20.1064C85.3897 19.6242 86.7448 19.9779 87.3495 20.891C87.6071 21.1804 87.9094 21.6369 87.9989 21.9713C88.9618 24.2218 88.6591 26.453 87.3598 26.9801C85.9373 27.7195 83.9775 26.4526 83.2274 24.3243C83.0483 23.6556 82.9587 23.3212 82.8244 22.8197C82.679 21.6044 83.1271 20.5885 84.2584 20.1064Z" fill="var(--illust-fill-1)" stroke="var(--illust-stroke)" strokeWidth="2" strokeMiterlimit="10" strokeLinejoin="round" />
      <path d="M32.2573 56.3306H30.0672V54.1406H28.19V56.3306H26V58.2704H28.19V60.4604H30.0672V58.2704H32.2573V56.3306Z" fill="var(--illust-accent)" />
      <path d="M37.0678 111.276H34.8778V109.086H33.0006V111.276H30.8105V113.215H33.0006V115.405H34.8778V113.215H37.0678V111.276Z" fill="var(--illust-accent)" />
      <path d="M132.806 111.403L130.126 110.05L131.479 107.37L129.182 106.211L127.829 108.89L125.15 107.537L123.952 109.911L126.631 111.263L125.278 113.943L127.575 115.103L128.928 112.423L131.607 113.776L132.806 111.403Z" fill="var(--illust-accent)" />
    </svg>
  );
}

export default function ListYourShopPage() {
  // "choose" | "login" | "register" | "dashboard"
  const [screen, setScreen] = useState("choose");
  const [session, setSession] = useState(null); // { contact, pin }
  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null = all, else "pending"|"approved"|"rejected"
  const [search, setSearch] = useState("");

  const [loginForm, setLoginForm] = useState({ contact: "", pin: "" });
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [regForm, setRegForm] = useState({
    shop_name: "", channel: "shop", contact: "", location: "", pin: "", pinConfirm: "",
  });
  const [regError, setRegError] = useState("");
  const [regBusy, setRegBusy] = useState(false);

  // Modal used for both adding a new product and editing an existing row.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // null = adding; otherwise the row being edited
  const [productForm, setProductForm] = useState({ product: "", category: "", price_rwf: "" });
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [formStatus, setFormStatus] = useState("idle"); // idle | sending | error
  const [formError, setFormError] = useState("");
  const [deleteBusyKey, setDeleteBusyKey] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setSession(parsed);
      setRestoring(true);
      loadDashboard(parsed).finally(() => setRestoring(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard(candidate) {
    setLoading(true);
    try {
      const res = await fetch(API_BASE + "/sellers/me", {
        headers: { "x-seller-contact": candidate.contact, "x-seller-pin": candidate.pin },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setSession(null);
        setScreen("choose");
        return;
      }
      const body = await res.json();
      setSeller(body.seller);
      setProducts(body.products);
      setSubmissions(body.submissions);
      setScreen("dashboard");
    } catch {
      // best effort — leave whatever was already on screen
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const res = await fetch(API_BASE + "/sellers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      if (res.status === 401) {
        setLoginError("Wrong contact or PIN.");
        return;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const candidate = { contact: loginForm.contact, pin: loginForm.pin };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(candidate));
      setSession(candidate);
      await loadDashboard(candidate);
    } catch {
      setLoginError("Could not reach the backend.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setRegError("");
    if (!PHONE_RE.test(regForm.contact)) {
      setRegError("Enter a valid 10-digit phone number.");
      return;
    }
    if (regForm.pin.length < 4) {
      setRegError("PIN must be at least 4 digits.");
      return;
    }
    if (regForm.pin !== regForm.pinConfirm) {
      setRegError("PINs don't match.");
      return;
    }
    setRegBusy(true);
    try {
      const res = await fetch(API_BASE + "/sellers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: regForm.shop_name, channel: regForm.channel,
          contact: regForm.contact, location: regForm.location, pin: regForm.pin,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setRegError(body.message || "Could not register.");
        return;
      }
      const candidate = { contact: regForm.contact, pin: regForm.pin };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(candidate));
      setSession(candidate);
      await loadDashboard(candidate);
    } catch {
      setRegError("Could not reach the backend.");
    } finally {
      setRegBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setSeller(null);
    setScreen("choose");
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await downscaleImage(file);
    setPhoto(blob);
    setPhotoPreview(URL.createObjectURL(blob));
  }

  function openAddModal() {
    setEditingRow(null);
    setProductForm({ product: "", category: "", price_rwf: "" });
    setPhoto(null);
    setPhotoPreview(null);
    setFormStatus("idle");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(row) {
    setEditingRow(row);
    setProductForm({
      product: row.product, category: row.category,
      price_rwf: row.price_rwf != null ? String(row.price_rwf) : "",
    });
    setPhoto(null);
    setPhotoPreview(row.image_url || null);
    setFormStatus("idle");
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingRow(null);
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    setFormError("");
    const price = productForm.price_rwf.trim();
    if (price && !/^\d+$/.test(price)) {
      setFormStatus("error");
      setFormError("Price must be a whole number, e.g. 5000.");
      return;
    }
    setFormStatus("sending");
    try {
      const fd = new FormData();
      fd.append("product", productForm.product);
      fd.append("category", productForm.category);
      if (productForm.price_rwf) fd.append("price_rwf", productForm.price_rwf);
      if (photo) fd.append("photo", photo, "product.jpg");

      const isEdit = editingRow !== null;
      const path = isEdit
        ? `/sellers/me/${editingRow.kind === "product" ? "products" : "submissions"}/${editingRow.id}`
        : "/sellers/me/products";
      const res = await fetch(API_BASE + path, {
        method: isEdit ? "PUT" : "POST",
        headers: { "x-seller-contact": session.contact, "x-seller-pin": session.pin },
        body: fd,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      closeModal();
      loadDashboard(session);
    } catch {
      setFormStatus("error");
    }
  }

  async function handleDelete(row) {
    const kind = row.kind === "product" ? "products" : "submissions";
    if (!window.confirm(`Remove "${row.product}"?`)) return;
    setDeleteBusyKey(`${row.kind}-${row.id}`);
    try {
      await fetch(`${API_BASE}/sellers/me/${kind}/${row.id}`, {
        method: "DELETE",
        headers: { "x-seller-contact": session.contact, "x-seller-pin": session.pin },
      });
      loadDashboard(session);
    } catch {
      // best effort — the row just won't disappear if this failed
    } finally {
      setDeleteBusyKey(null);
    }
  }

  // One row per real product: live products as "approved", plus pending/
  // rejected submissions — an already-approved submission is skipped here
  // since the resulting live product already represents it, avoiding the
  // duplicate entries that showed up when these were two separate lists.
  const rows = [
    ...products.map((p) => ({ ...p, status: "approved", kind: "product" })),
    ...submissions.filter((s) => s.status !== "approved").map((s) => ({ ...s, kind: "submission" })),
  ];
  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const liveCount = rows.filter((r) => r.status === "approved").length;
  const declinedCount = rows.filter((r) => r.status === "rejected").length;

  const visibleRows = rows
    .filter((r) => !statusFilter || r.status === statusFilter)
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return r.product.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    });

  /* ----------------------------- RESTORING ----------------------------- */
  if (restoring) {
    return (
      <div className="shop-dash-page">
        <div className="shop-dash">
          <div className="shop-dash-head">
            <div>
              <div className="skel skel-line w-60" style={{ height: 24, marginBottom: 8 }} />
              <div className="skel skel-line w-40" />
            </div>
          </div>
          <div className="shop-dash-section">
            <div className="skel-card" style={{ border: "none", padding: 0 }}>
              <div className="skel-card-lines">
                <div className="skel skel-line w-80" />
                <div className="skel skel-line w-60" />
                <div className="skel skel-line w-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ CHOOSE ------------------------------ */
  if (screen === "choose") {
    return (
      <div className="shop-page">
        <div className="shop-card">
          <h1>Your shop</h1>
          <p>Register once, then add as many products as you like without re-entering your shop details.</p>
          <div className="shop-choice">
            <button className="upload-btn" onClick={() => setScreen("login")}>Log in</button>
            <button className="shop-secondary-btn" onClick={() => setScreen("register")}>
              New seller — register
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------- LOGIN ------------------------------- */
  if (screen === "login") {
    return (
      <div className="shop-page">
        <div className="shop-card">
          <h1>Log in</h1>
          <p>Use the contact and PIN you registered with.</p>
          <form onSubmit={handleLogin} className="shop-form">
            <label>
              Phone number
              <input
                required
                type="tel"
                value={loginForm.contact}
                onChange={(e) => setLoginForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </label>
            <label>
              PIN
              <input
                required
                type="password"
                inputMode="numeric"
                value={loginForm.pin}
                onChange={(e) => setLoginForm((f) => ({ ...f, pin: e.target.value }))}
              />
            </label>
            <button type="submit" className="upload-btn" disabled={loginBusy}>
              {loginBusy ? "Checking…" : "Log in"}
            </button>
            {loginError && <p className="shop-error">{loginError}</p>}
          </form>
          <button className="shop-link-btn" onClick={() => setScreen("choose")}>Back</button>
        </div>
      </div>
    );
  }

  /* ------------------------------ REGISTER ------------------------------ */
  if (screen === "register") {
    return (
      <div className="shop-page">
        <div className="shop-card">
          <h1>Register your shop</h1>
          <p>One-time setup — you&apos;ll use this to log back in and add products any time.</p>
          <form onSubmit={handleRegister} className="shop-form">
            <label>
              Shop / seller name
              <input required value={regForm.shop_name} onChange={(e) => setRegForm((f) => ({ ...f, shop_name: e.target.value }))} />
            </label>
            <label>
              Channel
              <select value={regForm.channel} onChange={(e) => setRegForm((f) => ({ ...f, channel: e.target.value }))}>
                <option value="shop">Physical shop</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="marketplace">Marketplace</option>
              </select>
            </label>
            <label>
              Phone number (10 digits)
              <input
                required
                type="tel"
                inputMode="numeric"
                placeholder="e.g. 0788123456"
                maxLength={10}
                value={regForm.contact}
                onChange={(e) => setRegForm((f) => ({ ...f, contact: onlyDigits(e.target.value) }))}
              />
            </label>
            <label>
              Location
              <input
                required
                value={regForm.location}
                onChange={(e) => setRegForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Kigali, Kimironko"
              />
            </label>
            <label>
              Choose a PIN (4–6 digits)
              <input
                required
                type="password"
                inputMode="numeric"
                minLength={4}
                maxLength={6}
                value={regForm.pin}
                onChange={(e) => setRegForm((f) => ({ ...f, pin: e.target.value }))}
              />
            </label>
            <label>
              Confirm PIN
              <input
                required
                type="password"
                inputMode="numeric"
                minLength={4}
                maxLength={6}
                value={regForm.pinConfirm}
                onChange={(e) => setRegForm((f) => ({ ...f, pinConfirm: e.target.value }))}
              />
            </label>
            <button type="submit" className="upload-btn" disabled={regBusy}>
              {regBusy ? "Registering…" : "Register"}
            </button>
            {regError && <p className="shop-error">{regError}</p>}
          </form>
          <button className="shop-link-btn" onClick={() => setScreen("choose")}>Back</button>
        </div>
      </div>
    );
  }

  /* ------------------------------ DASHBOARD ------------------------------ */
  return (
    <div className="shop-dash-page">
      <div className="shop-dash">
        <div className="shop-dash-head">
          <div>
            <h1>{seller?.name}</h1>
            <p className="shop-dash-sub">
              <span className="chan">{seller?.channel}</span> {seller?.location} · {seller?.contact}
            </p>
          </div>
          <button className="shop-link-btn" onClick={logout}>Log out</button>
        </div>

        <div className="shop-stats">
          <button
            className={`shop-stat-card pending${statusFilter === "pending" ? " shop-stat-active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "pending" ? null : "pending")}
          >
            <div className="shop-stat-value">{pendingCount}</div>
            <div className="shop-stat-label">Pending review</div>
          </button>
          <button
            className={`shop-stat-card live${statusFilter === "approved" ? " shop-stat-active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "approved" ? null : "approved")}
          >
            <div className="shop-stat-value">{liveCount}</div>
            <div className="shop-stat-label">Live products</div>
          </button>
          <button
            className={`shop-stat-card declined${statusFilter === "rejected" ? " shop-stat-active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "rejected" ? null : "rejected")}
          >
            <div className="shop-stat-value">{declinedCount}</div>
            <div className="shop-stat-label">Declined</div>
          </button>
        </div>

        <div className="shop-dash-section">
          <div className="shop-section-head">
            <h2 style={{ marginBottom: 0 }}>
              Your products {loading && <span className="shop-dash-loading">refreshing…</span>}
            </h2>
            {rows.length > 0 && (
              <button className="shop-add-btn" onClick={openAddModal}>+ Add new product</button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="shop-empty-state">
              <EmptyProductsIllustration />
              <p className="shop-empty-title">No products yet</p>
              <p className="shop-empty-text">
                Add your first product so nearby buyers can find your shop when they scan for it.
              </p>
              <button className="shop-add-btn" onClick={openAddModal}>+ Add your first product</button>
            </div>
          ) : (
            <>
              <div className="admin-toolbar">
                <input
                  className="admin-search"
                  placeholder="Search by product or category…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  className="admin-export-btn"
                  disabled={visibleRows.length === 0}
                  onClick={() => exportTableToPdf(
                    `${seller?.name || "Products"} — Products`,
                    [
                      { label: "Product", value: (r) => r.product },
                      { label: "Category", value: (r) => r.category },
                      { label: "Price (RWF)", value: (r) => (r.price_rwf != null ? money(r.price_rwf) : null) },
                      { label: "Status", value: (r) => STATUS_LABEL[r.status] || r.status },
                    ],
                    visibleRows,
                  )}
                >
                  Export PDF
                </button>
              </div>
              {visibleRows.length === 0 ? (
                <p className="admin-empty">No matches.</p>
              ) : (
            <div className="shop-table-wrap">
              <table className="shop-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const rowKey = `${r.kind}-${r.id}`;
                    return (
                      <tr key={rowKey}>
                        <td>
                          {r.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image_url} alt={r.product} className="shop-table-thumb" />
                          )}
                        </td>
                        <td className="shop-table-name">{r.product}</td>
                        <td>{r.category}</td>
                        <td>{r.price_rwf != null ? `${money(r.price_rwf)} RWF` : "—"}</td>
                        <td>
                          <span className={`shop-status shop-status-${r.status}`}>
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                        <td>
                          <div className="shop-table-actions">
                            <button className="shop-row-btn" onClick={() => openEditModal(r)}>Edit</button>
                            <button
                              className="shop-row-btn danger"
                              disabled={deleteBusyKey === rowKey}
                              onClick={() => handleDelete(r)}
                            >
                              {deleteBusyKey === rowKey ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              )}
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{editingRow ? "Edit product" : "Add a product"}</h2>
            <form onSubmit={handleSubmitForm} className="shop-form">
              <label>
                Product name
                <input
                  required
                  value={productForm.product}
                  onChange={(e) => setProductForm((f) => ({ ...f, product: e.target.value }))}
                  placeholder="e.g. Anker Soundcore Life P2"
                />
              </label>
              <label>
                Category
                <input
                  required
                  value={productForm.category}
                  onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. earbuds"
                />
              </label>
              <label>
                Price in RWF (optional)
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={productForm.price_rwf}
                  onChange={(e) => setProductForm((f) => ({ ...f, price_rwf: e.target.value }))}
                />
              </label>
              <label>
                {editingRow ? "Replace product photo (optional)" : "Product photo (optional)"}
                <input type="file" accept="image/*" onChange={handlePhotoChange} />
              </label>
              {photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Selected product" className="shop-photo-preview" />
              )}
              <button type="submit" className="upload-btn" disabled={formStatus === "sending"}>
                {formStatus === "sending" ? "Saving…" : editingRow ? "Save changes" : "Add product"}
              </button>
              {formStatus === "error" && <p className="shop-error">{formError || "Something went wrong — try again."}</p>}
              <button type="button" className="shop-link-btn" onClick={closeModal}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
