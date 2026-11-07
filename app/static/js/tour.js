/* Guided Tour: visits every page, spotlights an element, names the requirement it proves and performs the action.
   State (step, paused) lives in sessionStorage so the tour survives page navigation. */
"use strict";
(function () {
  const $ = TM.$, wait = TM.sleep;
  const waitFor = async (sel, ms = 6000) => {          // element may appear after the page script runs
    for (let t = 0; t < ms; t += 100) { const e = $(sel); if (e) return e; await wait(100); }
    return null;
  };
  const askEx = (kind) => async () => { await waitFor(".chip"); return TM.askPage.runExample(kind); };
  const lastAnswer = ".msg-ai:last-of-type";

  // ---- The tour script: one array, in the order required by SHOWCASE.md ----
  const STEPS = [
    { page: "/auth/login", anon: true, el: "#login-card", req: "Authentication",
      text: "Sign-in uses Flask-Login. The form is CSRF-protected, fields are validated live, and passwords are stored hashed. “Use demo account” fills demo / Demo@1234.",
      run: async () => { await waitFor("#demo-btn"); await TM.fillDemo(); } },
    { page: "/dashboard", el: "#stats", req: "Persistence · UI",
      text: "Logged in. Dashboard tiles are counted live from SQLite: questions asked, answered vs not in documents, average response time." },
    { page: "/dashboard", el: "#chart-card", req: "UI · Dashboard",
      text: "Animated Chart.js charts of answer outcomes and response times, plus your recent conversations." },
    { page: "/ask", el: "#pipeline", req: "AI capability (Task 8 RAG)",
      text: "Every question runs Validate → Retrieve → Generate → Save. The strip lights up step by step with real timings." },
    { page: "/ask", el: ".chat-card", req: "AI capability · answerable", ai: true,
      text: "Answerable question: FAISS retrieves Wikipedia chunks and the local Qwen2.5-0.5B writes a cited answer. Saved to the database.",
      run: askEx("answerable") },
    { page: "/ask", el: ".msg-ai:last-of-type .sources", fallbackEl: ".chat-card", req: "AI capability · sources",
      text: "Each answer shows its source cards with similarity scores. Click a [n] citation to highlight the source it came from." },
    { page: "/ask", el: ".chat-card", req: "Refuses unanswerable questions", ai: true,
      text: "Out-of-scope question: the best retrieval score is below 0.50, so the LLM is skipped and the app says it's not in the documents.",
      run: askEx("unanswerable") },
    { page: "/ask", el: ".composer", req: "Validation (Pydantic)",
      text: "A 600-character question breaks the 3-500 character rule: the server returns 422 with a field-level message and nothing is saved.",
      run: askEx("too-long") },
    { page: "/ask", el: ".chat-card", req: "Security · prompt-injection guard",
      text: "“Ignore all previous instructions…” is detected before reaching the LLM: refused, saved as blocked, and logged.",
      run: askEx("injection") },
    { page: "/history", el: "#history-card", req: "Persistence",
      text: "Every answer is saved in SQLite (question, answer, sources JSON, status, latency) and survives restarts." },
    { page: "/history", el: "#history-search", req: "Persistence · search",
      text: "Search your history. Each row opens a detail page with the full answer and its sources.",
      run: async () => { await TM.typeInto($("#history-q"), "munnar"); } },
    { page: "/developer", el: "#key-card", req: "API auth · per-user key",
      text: "Regenerate your API key: it's shown once, and only its SHA-256 hash is stored. The old key stops working.",
      run: async () => { await waitFor("#key-regen"); await TM.apiPage.regenerate(); } },
    { page: "/developer", el: "#playground", req: "REST API · POST /api/v1/ask", ai: true,
      text: "API playground, valid request: JSON in, JSON out, authenticated with the key alone (no cookies). Returns 201.",
      run: async () => { if (!TM.apiPage.hasKey()) await TM.apiPage.regenerate(); TM.apiPage.loadExample("valid"); await TM.apiPage.send(); } },
    { page: "/developer", el: "#playground", req: "REST API · error format",
      text: "Missing key → 401 with the consistent error format {\"error\": {\"code\", \"message\"}}.",
      run: async () => { TM.apiPage.loadExample("nokey"); await TM.apiPage.send(); } },
    { page: "/security", el: "#card-ratelimit", req: "Security · rate limiting",
      text: "Flask-Limiter: 11 quick requests against a 10-per-minute rule → the 11th gets 429 and a toast.",
      run: async () => { await waitFor(".try-btn"); await TM.securityPage.run("ratelimit"); } },
    { page: "/admin/logs", el: "#logs-card", req: "Logging · admin page",
      text: "Structured JSON logs: request id, user, route, status, latency. Security events like the blocked injection and the 429s are highlighted.",
      run: async () => { await waitFor("#logs-body tr td"); await wait(400); await TM.logsPage.setSecurity(true); } },
    { page: "/security", el: "#card-headers", req: "Security · headers",
      text: "Every response carries CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and a request id.",
      run: async () => { await waitFor(".try-btn"); await TM.securityPage.run("headers"); } },
    { page: "/tour/missing-page", el: "#error-card", req: "Exception handling",
      text: "Unknown URL → a friendly 404 page (429 and 500 look the same). Users never see a stack trace; errors are logged with one." },
    { page: "/how-it-works", el: "#arch", req: "How it works",
      text: "Architecture: security layer → blueprints → one ask flow → rag_service (with LLM fallback) → SQLite + JSON logs. Tour complete!" },
  ];

  const KEY = "tm-tour";
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (s) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  let state = load(), token = 0, timer = null, spotEl = null, follow = null;
  const loggedIn = document.body.dataset.auth === "1";

  const spot = $("#tour-spot"), cap = $("#tour-caption"), bar = $("#tour-controls");
  const playLabel = $("#tour-play-label"), progress = $("#tour-progress-bar");

  function paint() {
    const on = !!state.active;
    document.body.classList.toggle("touring", on);
    bar.hidden = !on; $("#tour-start").hidden = on;
    if (!on) { spot.hidden = cap.hidden = true; return; }
    $("#tour-count").textContent = `${state.i + 1} / ${STEPS.length}`;
    playLabel.textContent = state.paused ? "▶ Play" : "⏸ Pause";
    TM.$$("#tour-speed button").forEach((b) => b.classList.toggle("on", b.dataset.speed === TM.speedName()));
  }

  function place() {
    if (!spotEl || !document.body.contains(spotEl)) return;
    const r = spotEl.getBoundingClientRect(), pad = 8;
    const top = Math.max(4, r.top - pad), height = Math.min(r.height + pad * 2, innerHeight - top - 150);
    Object.assign(spot.style, { left: r.left - pad + "px", top: top + "px", width: r.width + pad * 2 + "px", height: Math.max(40, height) + "px" });
  }
  function spotlight(el) {
    spotEl = el; spot.hidden = !el;
    if (!el) return;
    el.scrollIntoView({ behavior: TM.reducedMotion ? "auto" : "smooth", block: "center" });
    place();
    clearInterval(follow); follow = setInterval(place, 150);   // follows the element as answers grow / page scrolls
  }

  function animateProgress(ms) {
    progress.style.transition = "none"; progress.style.width = "0";
    if (!ms) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { progress.style.transition = `width ${ms}ms linear`; progress.style.width = "100%"; }));
  }

  async function navigate(step) {
    save(state);
    if (step.anon && loggedIn) {                       // the login step needs a signed-out session
      await TM.api("/auth/logout", { method: "POST" });
      location.href = step.page; return;
    }
    if (!step.anon && !loggedIn) {                     // sign in with the demo account through the real form
      const form = $("#login-form");
      if (form) {
        if (!form.elements.username.value) await TM.fillDemo();
        form.submit(); return;
      }
    }
    document.body.classList.add("leaving");
    setTimeout(() => (location.href = step.page), 150);
  }

  async function show(i) {
    clearTimeout(timer);
    const my = ++token;
    state.i = Math.max(0, Math.min(STEPS.length - 1, i));
    save(state); paint();
    const step = STEPS[state.i];
    if (location.pathname !== step.page) { cap.hidden = spot.hidden = true; return navigate(step); }

    $("#tour-req").textContent = step.req;
    $("#tour-text").textContent = step.text;
    cap.hidden = false; cap.style.animation = "none"; void cap.offsetWidth; cap.style.animation = "";
    animateProgress(0);
    spotlight(await waitFor(step.el, 2500) || (step.fallbackEl && $(step.fallbackEl)));
    if (my !== token) return;
    if (step.run) {
      await wait(TM.speed().stagger * 3);
      try { await step.run(); } catch (e) { console.warn("tour step failed", e); }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // keep Space/arrows for the tour
      if (my !== token) return;
      spotlight($(step.el) || (step.fallbackEl && $(step.fallbackEl)));
    }
    scheduleNext(my);
  }

  function scheduleNext(my) {
    clearTimeout(timer);
    if (state.paused || my !== token) { animateProgress(0); return; }
    const step = STEPS[state.i];
    const ms = step.ai ? TM.speed().aiDwell : TM.speed().step;
    animateProgress(ms);
    timer = setTimeout(() => { if (my === token) next(); }, ms);
  }

  function next() { if (state.i >= STEPS.length - 1) return exit(true); show(state.i + 1); }
  function back() { show(state.i - 1); }
  function start() { state = { active: true, i: 0, paused: false }; save(state); show(0); }
  function exit(done) {
    clearTimeout(timer); clearInterval(follow); token++;
    state = {}; save(state); spotEl = null; paint();
    if (done === true) TM.toast("Tour complete", "Every production feature was demonstrated live.", "success");
  }
  function togglePause() {
    state.paused = !state.paused; save(state); paint();
    if (state.paused) { clearTimeout(timer); animateProgress(0); } else scheduleNext(token);
  }

  TM.$$("[data-tour-start]").forEach((b) => b.addEventListener("click", start));
  $("#tour-next").addEventListener("click", next);
  $("#tour-back").addEventListener("click", back);
  $("#tour-play").addEventListener("click", togglePause);
  $("#tour-exit").addEventListener("click", exit);
  TM.$$("#tour-speed button").forEach((b) => b.addEventListener("click", () => { TM.setSpeed(b.dataset.speed); paint(); if (!state.paused) scheduleNext(token); }));
  document.addEventListener("keydown", (e) => {
    if (!state.active || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); togglePause(); }
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
  });
  addEventListener("resize", place);

  paint();
  if (state.active) setTimeout(() => show(state.i || 0), 250);   // resume after navigation
  TM.tour = { start, next, back, exit, togglePause, steps: STEPS };
})();
