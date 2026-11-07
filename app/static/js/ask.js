/* Ask page: chat UI, animated pipeline strip, typing answer, staggered source cards. */
"use strict";
(function () {
  const MAX = parseInt(TM.$("#ask-js").dataset.max, 10);
  const form = TM.$("#ask-form"), q = TM.$("#question"), btn = TM.$("#ask-btn"), chat = TM.$("#chat");
  const counter = TM.$("#counter"), qErr = TM.$("#question-error");
  const icon = (name) => TM.$(`#tpl-icons`).content.querySelector(`[data-icon="${name}"] svg`).cloneNode(true);
  let busy = false;

  /* ---------- live validation ---------- */
  function liveCheck() {
    const n = q.value.trim().length;
    counter.textContent = `${q.value.length} / ${MAX}`;
    counter.classList.toggle("over", q.value.length > MAX);
    const msg = q.value.length > MAX ? `Too long: ${q.value.length} characters (max ${MAX}). The server will reject it.` : "";
    qErr.textContent = msg;
    q.classList.toggle("invalid", !!msg);
    return n;
  }
  q.addEventListener("input", liveCheck);
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  /* ---------- pipeline strip ---------- */
  const steps = ["validate", "retrieve", "generate", "save"];
  const stepEl = (s) => TM.$(`.pipe-step[data-step="${s}"]`);
  const defaults = {};
  steps.forEach((s) => (defaults[s] = TM.$("[data-ms]", stepEl(s)).textContent));
  function setStep(s, state, label) {
    const el = stepEl(s);
    el.classList.remove("active", "done", "skipped", "warn", "error");
    if (state) el.classList.add(state);
    TM.$("[data-ms]", el).textContent = label || defaults[s];
    const line = el.previousElementSibling;
    if (line && line.classList.contains("pipe-line")) line.classList.toggle("done", state && state !== "skipped" && state !== "error");
  }
  const resetPipe = () => steps.forEach((s) => setStep(s, null));

  /* ---------- messages ---------- */
  function scroll() { chat.scrollTop = chat.scrollHeight; }
  function addUser(text) {
    const empty = TM.$("#chat-empty"); if (empty) empty.remove();
    const m = TM.el("div", "msg msg-user");
    const av = TM.el("span", "avatar sm", (document.querySelector(".user-meta b") || {}).textContent?.[0]?.toUpperCase() || "U");
    m.append(av, TM.el("p", null, text));
    chat.append(m); scroll();
  }
  function addPending() {
    const m = TM.el("div", "msg msg-ai pending");
    m.append(TM.el("div", "skeleton-line"), TM.el("div", "skeleton-line"), TM.el("div", "skeleton-line"));
    chat.append(m); scroll();
    return m;
  }
  function badge(cls, ic, text) { const b = TM.el("span", "badge " + cls); if (ic) b.append(icon(ic)); b.append(text); return b; }

  /** Render answer text with [n] / [n]* citations as clickable chips (DOM nodes, never innerHTML). */
  function renderAnswer(p, text, card) {
    p.textContent = "";
    text.split(/(\[\d\]\*?)/).forEach((part) => {
      const m = part.match(/^\[(\d)\](\*?)$/);
      if (!m) { p.append(document.createTextNode(part)); return; }
      const c = TM.el("span", "cite" + (m[2] ? " auto" : ""), `[${m[1]}]`);
      c.title = m[2] ? "Citation added automatically (closest source)" : "Cited by the model";
      c.addEventListener("click", () => {
        const s = TM.$(`.source[data-n="${m[1]}"]`, card);
        if (s) { s.classList.add("hl"); s.scrollIntoView({ behavior: "smooth", block: "nearest" }); setTimeout(() => s.classList.remove("hl"), 1600); }
      });
      p.append(c);
    });
  }

  async function renderResult(m, d) {
    m.classList.remove("pending"); m.textContent = "";
    const meta = TM.el("div", "msg-meta");
    if (d.status === "answered") meta.append(badge("badge-success", "check", "Answered"));
    else if (d.status === "not_found") meta.append(badge("badge-warn", "search", "Not in documents"));
    else if (d.status === "blocked") { meta.append(badge("badge-error", "shield", "Blocked: prompt injection")); m.classList.add("msg-blocked"); }
    if (d.fallback) meta.append(badge("badge-warn badge-sm", "zap", "Fallback answer"));
    meta.append(TM.el("span", "tag", d.provider), TM.el("span", "muted small", (d.latency_ms / 1000).toFixed(2) + " s"));
    const link = TM.el("a", "small", "Saved as #" + d.id); link.href = "/history/" + d.id;
    meta.append(link);
    const p = TM.el("p", "answer");
    m.append(meta, p);
    if (d.fallback) m.append(TM.el("small", "muted", `The local LLM failed (${d.fallback_reason}), so this answer was built from the best matching source sentences.`));
    await TM.typeText(p, d.answer);
    renderAnswer(p, d.answer, m);
    if (d.sources && d.sources.length) {
      const grid = TM.el("div", "sources");
      d.sources.forEach((s) => {
        const card = TM.el("article", "source"); card.dataset.n = s.n;
        const h = TM.el("header");
        h.append(TM.el("span", "cite", `[${s.n}]`), TM.el("b", null, s.title), TM.el("span", "muted small", "chunk #" + s.chunk_id),
                 TM.el("span", "score", s.score.toFixed(2)));
        const bar = TM.el("div", "scorebar"), fill = TM.el("span"); bar.append(fill);
        const a = TM.el("a", "small", "Wikipedia"); a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.append(icon("external"));
        card.append(h, bar, TM.el("p", null, s.text), a);
        grid.append(card);
      });
      m.append(grid);
      const cards = TM.$$(".source", grid);
      for (let i = 0; i < cards.length; i++) {
        await TM.sleep(TM.speed().stagger);
        cards[i].classList.add("in");
        TM.$(".scorebar span", cards[i]).style.width = Math.max(4, Math.min(100, d.sources[i].score * 100)) + "%";
      }
    }
    scroll();
  }

  function renderError(m, res) {
    m.classList.remove("pending"); m.classList.add("msg-error"); m.textContent = "";
    const err = (res.data && res.data.error) || { code: "error", message: "Something went wrong." };
    const meta = TM.el("div", "msg-meta");
    meta.append(badge("badge-error", "alert", `${res.status} · ${err.code}`));
    m.append(meta, TM.el("p", "answer", err.message));
    (err.details || []).forEach((d) => m.append(TM.el("small", "muted", `Field “${d.field}”: ${d.message}`)));
    scroll();
  }

  /** Ask a question. Returns a promise that resolves when the answer is fully rendered. */
  async function ask(text, opts) {
    opts = opts || {};
    if (busy) return;
    busy = true; btn.disabled = true;
    const sp = TM.speed();
    addUser(text.length > 160 ? text.slice(0, 160) + `… (${text.length} chars)` : text);
    const pending = addPending();
    resetPipe();
    setStep("validate", "active");
    const req = TM.api("/ask", { method: "POST", body: { question: text, simulate_llm_failure: !!opts.simulate } });
    // animate the strip while the server works; real timings replace the labels when the response arrives
    let settled = false;
    req.finally(() => (settled = true));
    (async () => {
      await TM.sleep(sp.pipeline); if (settled) return; setStep("validate", "done"); setStep("retrieve", "active");
      await TM.sleep(sp.pipeline); if (settled) return; setStep("retrieve", "done"); setStep("generate", "active", "working… (CPU)");
    })();
    const res = await req;
    if (res.ok) {
      const d = res.data.data, t = res.data.timings;
      setStep("validate", d.status === "blocked" ? "warn" : "done", d.status === "blocked" ? "injection blocked" : t.validate_ms + " ms");
      if (d.status === "blocked") { setStep("retrieve", "skipped", "skipped (blocked)"); setStep("generate", "skipped", "skipped (blocked)"); }
      else {
        setStep("retrieve", "done", t.retrieve_ms + " ms");
        if (d.provider === "retrieval") setStep("generate", "skipped", "skipped: score < 0.50");
        else setStep("generate", d.fallback ? "warn" : "done", (d.fallback ? "fallback · " : "") + (t.generate_ms / 1000).toFixed(2) + " s");
      }
      setStep("save", "done", "saved #" + d.id);
      await renderResult(pending, d);
      if (d.status === "blocked") TM.toast("Prompt injection blocked", "The request was refused and logged.", "warn");
      if (d.fallback) TM.toast("Fallback answer", "Local LLM failed, extractive answer used.", "warn");
    } else {
      resetPipe();
      if (res.status === 422 || res.status === 400) {
        setStep("validate", "error", "rejected (" + res.status + ")");
        const d = res.data && res.data.error && res.data.error.details;
        qErr.textContent = d ? d[0].message : res.data.error.message;
        q.classList.add("invalid");
        TM.toast("Validation error", qErr.textContent, "error");
      } else if (res.status === 503) {
        setStep("validate", "done"); setStep("retrieve", "error", "AI service unavailable");
        TM.toast("AI service unavailable", "Please try again.", "error");
      } else if (res.status !== 429) {
        TM.toast("Error " + res.status, (res.data && res.data.error && res.data.error.message) || "Request failed", "error");
      }
      renderError(pending, res);
    }
    busy = false; btn.disabled = false;
    return res;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = q.value;
    if (!text.trim()) { qErr.textContent = "Please type a question first."; q.classList.add("invalid"); return; }
    ask(text);
  });

  /** Fill the box like a person would, then ask (used by chips and the guided tour). */
  async function runExample(kind) {
    const chip = TM.$(`.chip[data-kind="${kind}"]`);
    if (!chip || busy) return;
    await TM.typeInto(q, chip.dataset.q);
    liveCheck();
    const res = await ask(chip.dataset.q, { simulate: chip.dataset.simulate === "1" });
    if (res && res.ok) { q.value = ""; liveCheck(); }
    return res;
  }
  TM.$$(".chip").forEach((c) => c.addEventListener("click", () => runExample(c.dataset.kind)));
  TM.askPage = { ask, runExample, isBusy: () => busy };
  liveCheck();
})();
