// Client-side "export to PDF" for reporting: renders a clean, print-only
// table into a hidden root and opens the browser's print dialog, where
// choosing "Save as PDF" produces the file — no server round-trip or new
// dependency. The printable table is built fresh from the given rows
// (not a DOM clone), so action buttons, thumbnails, and skeleton markup
// already on screen never leak into the printout.

function esc(value) {
  if (value == null) return "—";
  return String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function exportTableToPdf(title, columns, rows) {
  if (typeof window === "undefined") return;

  let root = document.getElementById("pdf-export-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "pdf-export-root";
    document.body.appendChild(root);
  }

  const headerCells = columns.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const bodyRows = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${esc(c.value(r))}</td>`).join("")}</tr>`)
    .join("");

  root.innerHTML = `
    <h1>${esc(title)}</h1>
    <p class="pdf-export-meta">Exported ${esc(new Date().toLocaleString())} · ${rows.length} row${rows.length === 1 ? "" : "s"}</p>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;

  document.body.classList.add("pdf-exporting");
  const cleanup = () => {
    document.body.classList.remove("pdf-exporting");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
