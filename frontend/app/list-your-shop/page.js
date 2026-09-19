"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/+$/, "");

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

export default function ListYourShopPage() {
  const [form, setForm] = useState({
    shop_name: "", channel: "shop", contact: "", location: "",
    product: "", category: "", price_rwf: "",
  });
  const [photo, setPhoto] = useState(null);       // downscaled Blob, ready to upload
  const [photoPreview, setPhotoPreview] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await downscaleImage(file);
    setPhoto(blob);
    setPhotoPreview(URL.createObjectURL(blob));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === "price_rwf" && !value) return; // leave optional price out rather than send ""
        fd.append(key, value);
      });
      if (photo) fd.append("photo", photo, "product.jpg");

      const res = await fetch(API_BASE + "/sellers/submit", { method: "POST", body: fd });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="shop-page">
        <div className="shop-card">
          <h1>Thanks!</h1>
          <p>We&apos;ve got your listing — it&apos;ll be reviewed and added to the local seller index.</p>
          <Link href="/" className="upload-btn shop-back">
            Back to SnapShop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-page">
      <div className="shop-card">
        <h1>List your shop</h1>
        <p>Get found when someone in Kigali scans an item you sell.</p>
        <form onSubmit={handleSubmit} className="shop-form">
          <label>
            Shop / seller name
            <input required value={form.shop_name} onChange={(e) => update("shop_name", e.target.value)} />
          </label>
          <label>
            Channel
            <select value={form.channel} onChange={(e) => update("channel", e.target.value)}>
              <option value="shop">Physical shop</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="marketplace">Marketplace</option>
            </select>
          </label>
          <label>
            Contact (phone, wa.me link, or Instagram handle)
            <input required value={form.contact} onChange={(e) => update("contact", e.target.value)} />
          </label>
          <label>
            Location
            <input
              required
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="e.g. Kigali, Kimironko"
            />
          </label>
          <label>
            Product name
            <input
              required
              value={form.product}
              onChange={(e) => update("product", e.target.value)}
              placeholder="e.g. Anker Soundcore Life P2"
            />
          </label>
          <label>
            Category
            <input
              required
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder="e.g. earbuds"
            />
          </label>
          <label>
            Price in RWF (optional)
            <input
              type="number"
              min="0"
              value={form.price_rwf}
              onChange={(e) => update("price_rwf", e.target.value)}
            />
          </label>
          <label>
            Product photo (optional)
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          </label>
          {photoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="Selected product" className="shop-photo-preview" />
          )}
          <button type="submit" className="upload-btn" disabled={status === "sending"}>
            {status === "sending" ? "Submitting…" : "Submit listing"}
          </button>
          {status === "error" && (
            <p className="shop-error">Something went wrong — check the backend is reachable and try again.</p>
          )}
        </form>
      </div>
    </div>
  );
}
