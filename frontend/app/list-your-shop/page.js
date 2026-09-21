"use client";

import { useEffect, useState } from "react";

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

function EmptyProductsIllustration() {
  return (
    <svg width="112" height="112" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 50 L60 35 L100 50 L100 90 L60 105 L20 90 Z"
        stroke="var(--ink-text-dim)" strokeWidth="2.5" strokeLinejoin="round" fill="var(--paper-2)" />
      <path d="M20 50 L60 65 L100 50" stroke="var(--ink-text-dim)" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M60 65 L60 105" stroke="var(--ink-text-dim)" strokeWidth="2.5" />
      <circle cx="88" cy="28" r="16" fill="var(--signal)" />
      <path d="M88 21 L88 35 M81 28 L95 28" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
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
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingRow(null);
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
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
              Contact (phone, wa.me link, or Instagram handle)
              <input
                required
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
              Contact (phone, wa.me link, or Instagram handle)
              <input required value={regForm.contact} onChange={(e) => setRegForm((f) => ({ ...f, contact: e.target.value }))} />
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
          <div className="shop-stat-card pending">
            <div className="shop-stat-value">{pendingCount}</div>
            <div className="shop-stat-label">Pending review</div>
          </div>
          <div className="shop-stat-card live">
            <div className="shop-stat-value">{liveCount}</div>
            <div className="shop-stat-label">Live products</div>
          </div>
          <div className="shop-stat-card declined">
            <div className="shop-stat-value">{declinedCount}</div>
            <div className="shop-stat-label">Declined</div>
          </div>
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
                  {rows.map((r) => {
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
              {formStatus === "error" && <p className="shop-error">Something went wrong — try again.</p>}
              <button type="button" className="shop-link-btn" onClick={closeModal}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
