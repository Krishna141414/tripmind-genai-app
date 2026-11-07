/* Admin logs: live table of structured JSON log lines, filter by level / security events. */
"use strict";
(function () {
  const body = TM.$("#logs-body"), count = TM.$("#log-count");
  const SECURITY_EVENTS = ["prompt_injection_blocked", "rate_limited", "csrf_blocked", "login_failed", "auth_failed", "forbidden", "llm_fallback"];
  let level = "", timer = null, seen = new Set(), first = true;

  function row(r) {
    const tr = TM.el("tr", "lvl-" + r.level);
    if (SECURITY_EVENTS.includes(r.event)) tr.classList.add("sec");
    const key = r.ts + r.msg;
    if (!first && !seen.has(key)) tr.classList.add("new");
    seen.add(key);
    const lvl = TM.el("span", "lvl " + r.level, r.level);
    const cells = [
      TM.el("td", "mono nowrap", (r.ts || "").replace("T", " ").slice(5, 19)),
      (() => { const td = TM.el("td"); td.append(lvl); return td; })(),
      TM.el("td", "mono", r.request_id || "-"),
      TM.el("td", null, r.user || "-"),
      TM.el("td", "mono", r.route ? `${r.method} ${r.route}` : "-"),
      TM.el("td", "mono", r.status != null ? String(r.status) : "-"),
      TM.el("td", "mono nowrap", r.latency_ms != null ? r.latency_ms + " ms" : "-"),
      TM.el("td", null, (r.event && r.event !== "request" ? `[${r.event}] ` : "") + r.msg),
    ];
    cells.forEach((c) => tr.append(c));
    tr.title = "Click to see the full JSON line";
    tr.addEventListener("click", () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains("expand")) return next.remove();
      const ex = TM.el("tr", "expand"), td = TM.el("td"); td.colSpan = 8;
      td.append(TM.el("pre", "code small", TM.prettyJson(r)));
      ex.append(td); tr.after(ex);
    });
    return tr;
  }

  async function load() {
    const res = await TM.api(`/admin/logs/data?limit=150&level=${encodeURIComponent(level)}`);
    if (!res.ok) return;
    let rows = res.data.data;
    if (TM.$("#log-security").checked) rows = rows.filter((r) => SECURITY_EVENTS.includes(r.event) || r.level === "ERROR");
    body.textContent = "";
    if (!rows.length) { const tr = TM.el("tr"), td = TM.el("td", "muted", "No log entries match."); td.colSpan = 8; tr.append(td); body.append(tr); }
    rows.forEach((r) => body.append(row(r)));
    count.textContent = rows.length + " entries";
    first = false;
  }
  function schedule() { clearInterval(timer); if (TM.$("#log-live").checked) timer = setInterval(load, 3000); }

  TM.$$("#log-level button").forEach((b) => b.addEventListener("click", () => {
    level = b.dataset.level;
    TM.$$("#log-level button").forEach((x) => x.classList.toggle("on", x === b));
    load();
  }));
  TM.$("#log-security").addEventListener("change", load);
  TM.$("#log-live").addEventListener("change", schedule);
  load(); schedule();
  TM.logsPage = { load, setSecurity: (on) => { TM.$("#log-security").checked = on; return load(); } };
})();
