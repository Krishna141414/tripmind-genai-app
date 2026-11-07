/* Dashboard: count-up stat tiles + animated Chart.js charts. */
"use strict";
(function () {
  TM.$$("[data-count]").forEach(TM.countUp);
  const data = JSON.parse(TM.$("#chart-data").textContent);
  if (!window.Chart) return;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let charts = [];

  function draw() {
    charts.forEach((c) => c.destroy());
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = css("--muted");
    const anim = { duration: TM.speed().count, easing: "easeOutCubic" };
    charts = [
      new Chart(TM.$("#status-chart"), {
        type: "doughnut",
        data: { labels: ["Answered", "Not in documents", "Blocked"],
                datasets: [{ data: data.status, backgroundColor: ["#16A34A", "#F59E0B", "#DC2626"], borderWidth: 0, hoverOffset: 6 }] },
        options: { animation: anim, cutout: "68%", maintainAspectRatio: false,
                   plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8 } } } },
      }),
      new Chart(TM.$("#latency-chart"), {
        type: "bar",
        data: { labels: data.latency.map((d) => d.q.length > 18 ? d.q.slice(0, 18) + "…" : d.q),
                datasets: [{ label: "seconds", data: data.latency.map((d) => d.s), borderRadius: 6, maxBarThickness: 28,
                             backgroundColor: data.latency.map((d) => d.status === "answered" ? "#2563EB" : d.status === "blocked" ? "#DC2626" : "#F59E0B") }] },
        options: { animation: anim, maintainAspectRatio: false, plugins: { legend: { display: false },
                   tooltip: { callbacks: { title: (i) => data.latency[i[0].dataIndex].q } } },
                   scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
                             y: { beginAtZero: true, grid: { color: css("--border") } } } },
      }),
    ];
  }
  draw();
  document.addEventListener("tm:theme", draw);
})();
