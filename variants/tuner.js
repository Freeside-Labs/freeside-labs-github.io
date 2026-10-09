"use strict";
// Signet tuner: same geometry as the generator used for options a–d, with every knob exposed.
(() => {
  const D = { face: 50, tipY: 112, tipX: 6, sweep: 0.45, hug: 0.32, belly: 18, flow: 0.45, apexY: 6, inset: 0.82, star: 0.36, starY: 0.12, starThin: 0.2, starColor: "silver", shade: 1 };
  const KNOBS = [
    ["face", "Face half-width", 30, 70, 1],
    ["apexY", "Apex height", 0, 40, 1],
    ["tipX", "Tip inset (x)", 0, 60, 1],
    ["tipY", "Tip height (y)", 60, 145, 1],
    ["hug", "Hug face edge", 0, 0.8, 0.01],
    ["sweep", "Leading sweep", 0.1, 0.95, 0.01],
    ["belly", "Belly depth", -20, 40, 1],
    ["flow", "Base flow-in", 0.05, 0.95, 0.01],
    ["inset", "Signet size", 0.5, 0.92, 0.01],
    ["star", "Star size", 0.1, 0.6, 0.01],
    ["starY", "Star offset", -0.4, 0.5, 0.01],
    ["starThin", "Star waist", 0.08, 0.45, 0.01],
    ["shade", "Wing shading", 0, 1, 1],
  ];
  const W = 240, H = 150, cx = W / 2;
  const p = { ...D };
  const f = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function build() {
    const A = [cx, p.apexY], BL = [cx - p.face, H - 12], BR = [cx + p.face, H - 12];
    const TL = [p.tipX, p.tipY], TR = [W - p.tipX, p.tipY];
    const wing = (s) => {
      const B = s < 0 ? BL : BR, T = s < 0 ? TL : TR;
      const c1 = lerp(A, B, p.hug);
      const c2 = [cx + s * (cx - p.tipX) * p.sweep, T[1] - 2];
      const d1 = [T[0] - s * (cx - p.tipX) * 0.3, T[1] + p.belly];
      // arrive at the face corner on the baseline, running flat, so the underside flows into the base
      const d2 = [B[0] + s * (cx - p.tipX - p.face) * p.flow, B[1]];
      return `M${f(A)} C${f(c1)} ${f(c2)} ${f(T)} C${f(d1)} ${f(d2)} ${f(B)} Z`;
    };
    const a = dist(BL, BR), b = dist(A, BR), c = dist(A, BL);
    const I = [(a * A[0] + b * BL[0] + c * BR[0]) / (a + b + c), (a * A[1] + b * BL[1] + c * BR[1]) / (a + b + c)];
    const sc = (q) => [I[0] + p.inset * (q[0] - I[0]), I[1] + p.inset * (q[1] - I[1])];
    const [iA, iL, iR] = [A, BL, BR].map(sc);
    const s = p.face * p.star, t = s * p.starThin, x = I[0], y = I[1] + p.face * p.starY;
    const star = `M${x} ${y - s} L${x + t} ${y - t} L${x + s} ${y} L${x + t} ${y + t} L${x} ${y + s} L${x - t} ${y + t} L${x - s} ${y} L${x - t} ${y - t} Z`;
    const left = p.shade ? "#b3afa6" : "#a9a59c", right = p.shade ? "#8d8a83" : "#a9a59c";
    const starFill = p.starColor === "mustard" ? "#e1a52c" : "#ece9e2";
    return `<g id="live"><g stroke="#1c1a16" stroke-width="3.4" stroke-linejoin="round">
      <path fill="${left}" d="${wing(-1)}"/><path fill="${right}" d="${wing(1)}"/>
      <polygon fill="#f3f0e8" points="${f(A)} ${f(BR)} ${f(BL)}"/>
      <polygon fill="#141310" stroke-width="2.2" points="${f(iA)} ${f(iR)} ${f(iL)}"/></g>
      <path fill="${starFill}" d="${star}"/></g>`;
  }

  const big = document.getElementById("big");
  const code = document.getElementById("code");
  const render = () => {
    big.innerHTML = build();
    code.textContent = Object.entries(p).map(([k, v]) => `${k}=${v}`).join(" ");
  };

  const form = document.getElementById("knobs");
  const inputs = {};
  for (const [k, label, min, max, step] of KNOBS) {
    const l = document.createElement("label");
    const span = document.createElement("span"); span.textContent = label;
    const r = Object.assign(document.createElement("input"), { type: "range", min, max, step, value: p[k] });
    const v = document.createElement("span"); v.textContent = p[k];
    r.addEventListener("input", () => { p[k] = Number(r.value); v.textContent = r.value; render(); });
    inputs[k] = [r, v];
    l.append(span, r, v); form.append(l);
  }
  const sl = document.createElement("label");
  const ss = document.createElement("span"); ss.textContent = "Star colour";
  const sel = document.createElement("select");
  for (const o of ["silver", "mustard"]) sel.append(new Option(o, o));
  sel.addEventListener("change", () => { p.starColor = sel.value; render(); });
  sl.append(ss, sel, document.createElement("span")); form.append(sl);

  document.getElementById("reset").addEventListener("click", () => {
    Object.assign(p, D);
    for (const [k, [r, v]] of Object.entries(inputs)) { r.value = p[k]; v.textContent = p[k]; }
    sel.value = p.starColor; render();
  });
  render();
})();
