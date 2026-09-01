"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const DEMO_RESULT = {
  item: {
    category: "earbuds", brand: null, model: null,
    attributes: ["wireless", "in-ear", "charging case", "black"],
    visible_text: null, confidence: 0.82,
  },
  sellers: [
    { name: "Kigali Gadget Hub", channel: "shop", location: "City Centre", price_rwf: 28000, match_score: 0.60 },
    { name: "@kgl.gadgets", channel: "instagram", location: "Kigali (delivery)", price_rwf: 30000, match_score: 0.58 },
    { name: "TechPoint Rwanda", channel: "shop", location: "Kimironko", price_rwf: 45000, match_score: 0.55 },
  ],
  mock: true,
};

function money(n) {
  return n == null ? "—" : n.toLocaleString("en-US");
}

// Turn a seller's channel + contact into something tappable.
function contactHref(seller) {
  const c = (seller.contact || "").trim();
  if (!c) return null;
  if (seller.channel === "shop") {
    const digits = c.replace(/[^\d+]/g, "");
    return digits ? `tel:${digits}` : null;
  }
  if (seller.channel === "whatsapp" || seller.channel === "instagram" || seller.channel === "marketplace") {
    return /^https?:\/\//i.test(c) ? c : `https://${c}`;
  }
  return null;
}

function ConfidenceRing({ value }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="conf-ring">
      <circle cx="28" cy="28" r={r} className="conf-ring-bg" />
      <circle
        cx="28" cy="28" r={r} className="conf-ring-fg"
        style={{ strokeDasharray: c, strokeDashoffset: c * (1 - pct) }}
      />
      <text x="28" y="32" textAnchor="middle" className="conf-ring-text">
        {value == null ? "—" : Math.round(pct * 100) + "%"}
      </text>
    </svg>
  );
}

export default function Viewfinder() {
  const [DEMO] = useState(() => new URLSearchParams(window.location.search).has("demo"));
  const [API_BASE] = useState(() =>
    (
      new URLSearchParams(window.location.search).get("api") ||
      process.env.NEXT_PUBLIC_API_BASE ||
      "http://localhost:8000"
    ).replace(/\/+$/, "")
  );

  const [appState, setAppState] = useState("landing");
  const [facing, setFacing] = useState("environment");
  const [mirror, setMirror] = useState(false);
  const [dotClass, setDotClass] = useState("dot off");
  const [statusText, setStatusText] = useState("Ready");
  const [overlayMsg, setOverlayMsg] = useState(
    "Allow camera access to point and identify, or upload a photo instead."
  );
  const [result, setResult] = useState(null); // { item, sellers, mock } | { error, message }
  const [cameraTried, setCameraTried] = useState(false);
  const [notifyContact, setNotifyContact] = useState("");
  const [notifySent, setNotifySent] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(null); // null | true | false

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  async function startCamera(nextFacing = facing) {
    setCameraTried(true);
    if (DEMO) {
      setAppState("idle");
      setDotClass("dot demo");
      setStatusText("Demo");
      return;
    }
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play?.().catch(() => {});
      }
      setMirror(nextFacing === "user");
      setAppState("idle");
      setDotClass("dot");
      setStatusText("Live");
    } catch (err) {
      setAppState("blocked");
      setDotClass("dot off");
      setStatusText("Off");
      if (err && err.name === "NotAllowedError") {
        setOverlayMsg("Camera access was blocked. Enable it in your browser, or upload a photo instead.");
      }
    }
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function frameToBlob() {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const long = Math.max(vw, vh);
      const scale = Math.min(1, 1024 / long);
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
    });
  }

  async function identify(blob) {
    setAppState("identifying");
    setNotifyContact("");
    setNotifySent(false);
    setFeedbackSent(null);
    if (DEMO) {
      setTimeout(() => render(DEMO_RESULT), 1300);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", blob, "capture.jpg");
      const res = await fetch(API_BASE + "/recognize/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("HTTP " + res.status);
      render(await res.json());
    } catch (err) {
      renderError(err.message);
    }
  }

  function capture() {
    if (videoRef.current) videoRef.current.pause(); // freeze on the captured frame, no live feed while processing
    setAppState("capturing");
    if (navigator.vibrate) navigator.vibrate(12);
    setTimeout(async () => {
      const blob = await frameToBlob();
      identify(blob);
    }, 260);
  }

  function render(data) {
    const sellers = data.sellers || [];
    setResult({ item: data.item || {}, sellers, mock: !!data.mock });
    setDotClass(data.mock ? "dot demo" : "dot");
    setStatusText(data.mock ? "Demo data" : "Live");
    setAppState("result");
    if (sellers.length > 0 && navigator.vibrate) navigator.vibrate([15, 40, 15]);
  }

  function renderError(msg) {
    setResult({ error: true, message: msg || "" });
    setAppState("result");
  }

  async function handleNotifySubmit(e) {
    e.preventDefault();
    if (!notifyContact.trim()) return;
    setNotifySent(true); // optimistic — this is a best-effort signal, not worth blocking the UI on
    try {
      await fetch(API_BASE + "/notify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: notifyContact.trim(), category: it?.category, brand: it?.brand }),
      });
    } catch {
      // best-effort; already showing confirmation
    }
  }

  async function submitFeedback(helpful) {
    setFeedbackSent(helpful);
    try {
      await fetch(API_BASE + "/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: it?.category, brand: it?.brand, confidence: it?.confidence, helpful }),
      });
    } catch {
      // best-effort; already showing confirmation
    }
  }

  function handleAgain() {
    const hasStream = !!streamRef.current;
    if (hasStream || DEMO) {
      if (videoRef.current) videoRef.current.play?.().catch(() => {});
      setAppState("idle");
      setDotClass(DEMO ? "dot demo" : "dot");
      setStatusText(DEMO ? "Demo" : "Live");
    } else if (cameraTried) {
      setAppState("blocked");
      setDotClass("dot off");
      setStatusText("Off");
    } else {
      setAppState("landing");
      setDotClass("dot off");
      setStatusText("Ready");
    }
  }

  function handleSwitch() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    startCamera(next);
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (f) identify(f);
    e.target.value = "";
  }

  const it = result && !result.error ? result.item : null;
  const brandLine = it ? [it.brand, it.model].filter(Boolean).join(" ") : "";
  const idName = it ? it.category || "Unknown" : result?.error ? "Hmm" : "—";
  const idBrand = it ? brandLine || (it.visible_text ? `"${it.visible_text}"` : "") : "";

  return (
    <div id="app" className={`state-${appState}`}>
      <div className="stage">
        <video ref={videoRef} id="video" className={mirror ? "mirror" : ""} playsInline autoPlay muted />
        <div className="vignette" />
        <div className="frame">
          <div className="bracket-box">
            <i className="b tl" /><i className="b tr" /><i className="b bl" /><i className="b br" />
            <div className="scanline" />
          </div>
        </div>
        <div className="flash" />
      </div>

      <div className="topbar">
        <div className="wordmark">
          Snap<span>Shop</span>
        </div>
        <div className="status">
          <span className={dotClass} />
          <span>{statusText}</span>
        </div>
      </div>

      <div className="prompt">
        <h1>Point at anything</h1>
        <p>Find what it is — and who sells it near you.</p>
      </div>

      <div className="controls">
        <div className="sub-actions">
          <button className="txt-btn" onClick={handleSwitch} title="Switch camera">
            <svg viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Flip
          </button>
          <button className="shutter" onClick={capture} aria-label="Identify" />
          <button className="txt-btn" onClick={pickFile} title="Upload a photo">
            <svg viewBox="0 0 24 24">
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M5 20h14" />
            </svg>
            Upload
          </button>
        </div>
      </div>

      <div className="landing">
        <svg className="ic" viewBox="0 0 24 24">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <div className="wordmark">
          Snap<span>Shop</span>
        </div>
        <p>Find what it is — and who sells it near you.</p>
        <button className="upload-btn" onClick={() => startCamera("environment")}>
          Enable camera to scan
        </button>
        <button className="txt-btn" onClick={pickFile} style={{ marginTop: "16px" }}>
          Or upload a photo instead
        </button>
        <Link href="/list-your-shop" className="txt-btn" style={{ marginTop: "6px", opacity: 0.6 }}>
          Have a shop? List it here
        </Link>
      </div>

      <div className="overlay">
        <svg className="ic" viewBox="0 0 24 24">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <h2>Camera is off</h2>
        <p>{overlayMsg}</p>
        <button className="upload-btn" onClick={pickFile}>
          Upload a photo
        </button>
      </div>

      <div className="sheet">
        <div className="grabber" />
        <div className="id-head">
          <div style={{ minWidth: 0 }}>
            <div className="id-name">{idName}</div>
            <div className="id-brand">{idBrand}</div>
          </div>
          <div className="conf">
            <ConfidenceRing value={it?.confidence} />
            <span>match</span>
          </div>
        </div>
        <div className="tags">
          {it?.attributes?.map((a, i) => (
            <span className="tag" key={i}>{a}</span>
          ))}
        </div>
        <div className="rule" />
        <div className="buy-label">Where to buy in Kigali</div>
        <div>
          {result?.error ? (
            <div className="empty">
              Could not reach the recognition service.
              <br />
              Check the backend is running, then try again.
              <br />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{result.message}</span>
            </div>
          ) : result && result.sellers.length === 0 ? (
            <div className="empty">
              No local sellers matched yet. As the seller index grows, matches will appear here.
              {notifySent ? (
                <div className="notify-sent">We&apos;ll let you know when one lists it.</div>
              ) : (
                <form className="notify-form" onSubmit={handleNotifySubmit}>
                  <input
                    type="text"
                    inputMode="tel"
                    placeholder="Your phone or email"
                    value={notifyContact}
                    onChange={(e) => setNotifyContact(e.target.value)}
                    className="notify-input"
                  />
                  <button type="submit" className="notify-btn" disabled={!notifyContact.trim()}>
                    Notify me
                  </button>
                </form>
              )}
            </div>
          ) : (
            result?.sellers.map((s, i) => {
              const href = contactHref(s);
              const Tag = href ? "a" : "div";
              return (
                <Tag
                  className="seller"
                  key={i}
                  href={href || undefined}
                  target={href ? "_blank" : undefined}
                  rel={href ? "noopener noreferrer" : undefined}
                >
                  <div className="seller-main">
                    <div className="seller-name">{s.name}</div>
                    <div className="seller-meta">
                      <span className="chan">{s.channel}</span>
                      {s.location}
                    </div>
                    {s.match_reason && <div className="match-why">Matched on {s.match_reason}</div>}
                  </div>
                  <div className="seller-right">
                    <div className="price">
                      {money(s.price_rwf)} <small>RWF</small>
                    </div>
                    <div className="score">{Math.round((s.match_score || 0) * 100)}% match</div>
                  </div>
                  {href && <span className="chevron">›</span>}
                </Tag>
              );
            })
          )}
        </div>
        {it && (
          <div className="feedback-row">
            <span>Was this right?</span>
            <button
              className={`fb-btn${feedbackSent === true ? " fb-active" : ""}`}
              onClick={() => submitFeedback(true)}
              aria-label="Yes, correct"
              disabled={feedbackSent !== null}
            >
              👍
            </button>
            <button
              className={`fb-btn${feedbackSent === false ? " fb-active" : ""}`}
              onClick={() => submitFeedback(false)}
              aria-label="No, incorrect"
              disabled={feedbackSent !== null}
            >
              👎
            </button>
            {feedbackSent !== null && <span className="feedback-thanks">Thanks!</span>}
          </div>
        )}
        <button className="again" onClick={handleAgain}>
          Scan again
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
