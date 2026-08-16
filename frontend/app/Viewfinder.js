"use client";

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
      if (videoRef.current) videoRef.current.srcObject = stream;
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
    setAppState("capturing");
    if (navigator.vibrate) navigator.vibrate(12);
    setTimeout(async () => {
      const blob = await frameToBlob();
      identify(blob);
    }, 260);
  }

  function render(data) {
    setResult({ item: data.item || {}, sellers: data.sellers || [], mock: !!data.mock });
    setDotClass(data.mock ? "dot demo" : "dot");
    setStatusText(data.mock ? "Demo data" : "Live");
    setAppState("result");
  }

  function renderError(msg) {
    setResult({ error: true, message: msg || "" });
    setAppState("result");
  }

  function handleAgain() {
    const hasStream = !!streamRef.current;
    if (hasStream || DEMO) {
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
  const confVal = it && it.confidence != null ? Math.round(it.confidence * 100) + "%" : "—";

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
            <b>{confVal}</b>
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
            <div className="empty">No local sellers matched yet. As the seller index grows, matches will appear here.</div>
          ) : (
            result?.sellers.map((s, i) => (
              <div className="seller" key={i}>
                <div className="seller-main">
                  <div className="seller-name">{s.name}</div>
                  <div className="seller-meta">
                    <span className="chan">{s.channel}</span>
                    {s.location}
                  </div>
                </div>
                <div className="seller-right">
                  <div className="price">
                    {money(s.price_rwf)} <small>RWF</small>
                  </div>
                  <div className="score">{Math.round((s.match_score || 0) * 100)}% match</div>
                </div>
              </div>
            ))
          )}
        </div>
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
