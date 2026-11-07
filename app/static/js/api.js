/* API page: regenerate/copy key (shown once) + playground that calls the real /api/v1 endpoints. */
"use strict";
(function () {
  const box = TM.$("#key-box"), reveal = TM.$("#key-reveal"), copy = TM.$("#key-copy");
  let plainKey = null, shown = false;              // the plain key lives only in this page's memory
  const mask = (k) => k.slice(0, 8) + "•".repeat(24);

  async function regenerate() {
    const res = await TM.api("/developer/regenerate", { method: "POST" });
    if (!res.ok) return TM.toast("Could not regenerate", (res.data && res.data.error && res.data.error.message) || "", "error");
    plainKey = res.data.key; shown = true;
    box.textContent = plainKey; box.classList.add("fresh");
    reveal.disabled = copy.disabled = false;
    TM.$("#key-note").textContent = "New key created. Copy it now: only its SHA-256 hash is stored, so it can't be shown again after you leave this page. The old key no longer works.";
    TM.$("#curl-key").textContent = plainKey;
    TM.toast("API key regenerated", "Old key revoked. New key shown once.", "success");
    loadExample(current);
    return plainKey;
  }
  TM.$("#key-regen").addEventListener("click", regenerate);
  reveal.addEventListener("click", () => { if (!plainKey) return; shown = !shown; box.textContent = shown ? plainKey : mask(plainKey); });
  copy.addEventListener("click", () => plainKey && TM.copy(plainKey));

  /* ---------- playground ---------- */
  const EXAMPLES = {
    valid:   { method: "POST", url: "/api/v1/ask", key: true, body: { question: "What is Hampi known for?" } },
    nokey:   { method: "POST", url: "/api/v1/ask", key: false, body: { question: "What is Hampi known for?" } },
    invalid: { method: "POST", url: "/api/v1/ask", key: true, body: { question: "hi" } },
    history: { method: "GET", url: "/api/v1/history?limit=3", key: true },
    health:  { method: "GET", url: "/api/v1/health", key: false },
  };
  let current = "valid";
  const bodyEl = TM.$("#pg-body"), out = TM.$("#pg-response"), status = TM.$("#pg-status");

  function headersFor(ex) {
    const h = { Accept: "application/json" };
    if (ex.body) h["Content-Type"] = "application/json";
    if (ex.key) h["X-API-Key"] = plainKey || "<regenerate a key first>";
    return h;
  }
  function loadExample(name) {
    current = name;
    const ex = EXAMPLES[name];
    TM.$$("#pg-examples button").forEach((b) => b.classList.toggle("on", b.dataset.ex === name));
    TM.$("#pg-method").textContent = ex.method;
    TM.$("#pg-method").className = "method " + ex.method.toLowerCase();
    TM.$("#pg-url").textContent = ex.url;
    const shownHeaders = Object.assign({}, headersFor(ex));
    if (shownHeaders["X-API-Key"] && plainKey) shownHeaders["X-API-Key"] = plainKey.slice(0, 8) + "…";
    TM.$("#pg-headers").textContent = Object.entries(shownHeaders).map(([k, v]) => `${k}: ${v}`).join("\n");
    bodyEl.value = ex.body ? TM.prettyJson(ex.body) : "";
    bodyEl.disabled = !ex.body;
  }
  TM.$$("#pg-examples button").forEach((b) => b.addEventListener("click", () => loadExample(b.dataset.ex)));

  async function send() {
    const ex = EXAMPLES[current], btn = TM.$("#pg-send");
    if (ex.key && !plainKey) {
      TM.toast("No key in this page", "Regenerate a key first: keys are stored hashed and shown only once.", "warn");
      return;
    }
    btn.disabled = true;
    status.className = "badge"; status.textContent = "…";
    out.textContent = ex.url.includes("ask") && current === "valid" ? "Waiting for the RAG pipeline (CPU model, a few seconds)…" : "Sending…";
    const headers = headersFor(ex);
    // credentials: "omit" -> no session cookie, proving the API authenticates with the key alone
    const res = await TM.api(ex.url, { method: ex.method, headers, body: ex.body ? bodyEl.value : undefined, csrf: false,
                                       credentials: "omit", quiet429: false });
    status.textContent = res.status;
    status.className = "badge " + (res.ok ? "badge-success" : res.status >= 500 ? "badge-error" : "badge-warn");
    TM.$("#pg-time").textContent = res.ms + " ms";
    out.textContent = TM.prettyJson(res.data);
    btn.disabled = false;
    return res;
  }
  TM.$("#pg-send").addEventListener("click", send);
  loadExample("valid");
  TM.apiPage = { regenerate, loadExample, send, hasKey: () => !!plainKey };
})();
