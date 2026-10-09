// Freeside Labs — variant D: UTC clock, Monte Carlo ridgelines, attitude console.
"use strict";

(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = (n) => String(n).padStart(2, "0");

  // ---- UTC clock / year ----
  const utc = document.getElementById("utc");
  const tick = () => {
    const d = new Date();
    utc.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
  document.getElementById("year").textContent = new Date().getFullYear();

  // ---- hero ridgelines: pointing error from a Monte Carlo of flexible-spacecraft slews ----
  // Single-axis hub + one flexible mode, PD + feedforward tracking a cycloidal slew.
  // Each trace is one dispersed run (controller bandwidth, flex frequency, damping, coupling).
  const ridges = document.getElementById("ridges");
  if (ridges) {
    let seed = 1979;
    const rand = () => { // mulberry32, seeded so the plot is the same every load
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    const U = (a, b) => a + (b - a) * rand();

    const runSlew = () => {
      const wc = U(0.32, 0.5), zc = 0.7, Kp = wc * wc, Kd = 2 * zc * wc;
      const wf = U(1.1, 2.6), zf = U(0.004, 0.02), c = U(0.15, 0.38), det = 1 - c * c;
      const T = 46, t0 = 4, Ts = U(13, 18), dt = 0.005, N = 150;
      let th = 0, w = 0, eta = 0, etad = 0;
      const out = [];
      const every = Math.round(T / dt / N);
      for (let i = 0, t = 0; i <= N * every; i++, t += dt) {
        const s = Math.min(1, Math.max(0, (t - t0) / Ts));
        const ref = s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);
        const refd = (t > t0 && t < t0 + Ts) ? (1 - Math.cos(2 * Math.PI * s)) / Ts : 0;
        const refdd = (t > t0 && t < t0 + Ts) ? (2 * Math.PI * Math.sin(2 * Math.PI * s)) / (Ts * Ts) : 0;
        const u = refdd + Kp * (ref - th) + Kd * (refd - w);
        const f = -2 * zf * wf * etad - wf * wf * eta;
        const thdd = (u - c * f) / det, etadd = (f - c * u) / det;
        w += thdd * dt; th += w * dt; etad += etadd * dt; eta += etad * dt;
        if (i % every === 0) out.push(ref - th);
      }
      return out;
    };

    const GROUPS = ["#ff3fa4", "#a35cff", "#ffb43c", "#3ff0ff"], PER = 5;
    const runs = Array.from({ length: GROUPS.length * PER }, runSlew);
    const peak = Math.max(...runs.flat().map(Math.abs));
    const NS = "http://www.w3.org/2000/svg";
    const frag = document.createDocumentFragment();
    runs.forEach((r, i) => {
      const g = Math.floor(i / PER), k = i % PER; // k = 0 back … PER-1 front
      const x0 = 96 - k * 16, width = 380, base = 62 + g * 100 + k * 13;
      const amp = 30 * (0.85 + 0.15 * k / (PER - 1));
      const d = r.map((e, j) => {
        const n = 0.035 * gauss(); // sensor noise, a few percent of peak
        const x = x0 + (j / (r.length - 1)) * width;
        const y = base - (e / peak + n) * amp;
        return `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join("");
      const op = (0.35 + 0.65 * k / (PER - 1)).toFixed(2);
      for (const cls of ["glow", "core"]) {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("class", cls);
        p.setAttribute("stroke", k === 0 ? "#e9edf2" : GROUPS[g]);
        p.setAttribute("opacity", op);
        frag.appendChild(p);
      }
    });
    ridges.appendChild(frag);
  }

  // ---- quaternion helpers, [w, x, y, z], scalar first ----
  const qmul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
  const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
  const qnorm = (q) => { const n = Math.hypot(...q); return q.map((c) => c / n); };
  const qaxis = (axis, ang) => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), axis[0] * s, axis[1] * s, axis[2] * s]; };
  const rotate = (q, v) => qmul(qmul(q, [0, ...v]), qconj(q)).slice(1);
  const errAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(qmul(qconj(a), b)[0])));
  const randomQ = () => {
    // Shoemake uniform random rotation
    const [u1, u2, u3] = [Math.random(), Math.random(), Math.random()];
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    return [a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)];
  };
  const toAxisAngle = (q) => {
    if (q[0] < 0) q = q.map((c) => -c); // shortest path
    const ang = 2 * Math.acos(Math.min(1, q[0]));
    const s = Math.sqrt(Math.max(1e-12, 1 - q[0] * q[0]));
    return { axis: [q[1] / s, q[2] / s, q[3] / s], ang };
  };

  // ---- console ----
  const canvas = document.getElementById("att");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = 360, H = 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const out = {
    mode: document.getElementById("t-mode"),
    q: document.getElementById("t-q"),
    w: document.getElementById("t-w"),
    err: document.getElementById("t-err"),
    t: document.getElementById("t-t"),
  };
  const NEON = "#3ff0ff", GRID = "#5b4a8a", TARGET = "#ff3fa4";

  // Spacecraft wireframe in body axes: bus cube, two solar wings on ±y, boresight on +z.
  const edges = [];
  const box = (sx, sy, sz, cx = 0, cy = 0, cz = 0) => {
    const v = [];
    for (const x of [-sx, sx]) for (const y of [-sy, sy]) for (const z of [-sz, sz]) v.push([x + cx, y + cy, z + cz]);
    [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
      .forEach(([a, b]) => edges.push([v[a], v[b]]));
  };
  box(0.45, 0.45, 0.55);
  box(0.32, 0.6, 0.02, 0, 1.1, 0);
  box(0.32, 0.6, 0.02, 0, -1.1, 0);
  edges.push([[0, 0.45, 0], [0, 0.5, 0]], [[0, -0.45, 0], [0, -0.5, 0]]);
  for (const s of [1, -1]) for (const y of [0.8, 1.1, 1.4]) edges.push([[-0.32, s * y, 0], [0.32, s * y, 0]]);
  const boresight = [[0, 0, 0.55], [0, 0, 1.6]];

  // Fixed camera: tilt the inertial frame so the view isn't face-on.
  const cam = qmul(qaxis([1, 0, 0], -1.05), qaxis([0, 0, 1], 0.6));
  const project = (v) => {
    const p = rotate(cam, v);
    const d = 5.2, f = 300 / (d - p[1]);
    return [W / 2 + p[0] * f * 0.95, H / 2 - p[2] * f * 0.95];
  };
  const line = (a, b) => { const [x1, y1] = project(a), [x2, y2] = project(b); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); };

  // ---- guidance: rest-to-rest eigenaxis slews with a cycloidal angle profile ----
  let q = [1, 0, 0, 0], q0 = q, qT = q, slew = null, phase = "INIT", phaseT = 0, settle = null;
  const t0 = performance.now();

  const newSlew = () => {
    q0 = q; qT = randomQ();
    const { axis, ang } = toAxisAngle(qmul(qconj(q0), qT));
    const dur = 2.2 + (ang * 180 / Math.PI) / 45;
    slew = { axis, ang, dur };
    phase = "SLEW"; phaseT = 0;
  };

  let wDeg = 0;
  const step = (dt) => {
    phaseT += dt;
    if (phase === "INIT" && phaseT > 0.8) newSlew();
    else if (phase === "SLEW") {
      const s = Math.min(1, phaseT / slew.dur);
      const th = slew.ang * (s - Math.sin(2 * Math.PI * s) / (2 * Math.PI));
      wDeg = (slew.ang * (1 - Math.cos(2 * Math.PI * s)) / slew.dur) * 180 / Math.PI;
      q = qmul(q0, qaxis(slew.axis, th));
      if (s >= 1) { phase = "SETTLE"; phaseT = 0; settle = randomQ().slice(1); }
    } else if (phase === "SETTLE") {
      // decaying residual from flex modes / controller transient
      const a = 0.006 * Math.exp(-phaseT / 0.45) * Math.sin(2 * Math.PI * 1.4 * phaseT);
      const n = Math.hypot(...settle);
      q = qmul(qT, qaxis(settle.map((c) => c / n), a));
      wDeg = Math.abs(0.006 * Math.exp(-phaseT / 0.45) * 2 * Math.PI * 1.4) * 180 / Math.PI;
      if (phaseT > 1.8) { phase = "LOCK"; phaseT = 0; }
    } else if (phase === "LOCK") {
      q = qnorm(qmul(qT, qaxis([0, 0, 1], (Math.random() - 0.5) * 6e-5)));
      wDeg = Math.random() * 2e-3;
      if (phaseT > 2.6) newSlew();
    }
  };

  let lastText = 0, lastPhase = "";
  const fmt = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4);
  const render = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;

    // inertial reference ring + axes
    ctx.strokeStyle = GRID;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * 2 * Math.PI, [x, y] = project([2 * Math.cos(a), 2 * Math.sin(a), 0]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    line([-2.2, 0, 0], [2.2, 0, 0]); line([0, -2.2, 0], [0, 2.2, 0]); line([0, 0, -1.6], [0, 0, 1.9]);
    ctx.stroke();

    // target boresight (dashed, magenta)
    ctx.strokeStyle = TARGET;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); line(rotate(qT, boresight[0]), rotate(qT, boresight[1]).map((c) => c * 1.15)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // spacecraft: one path, stroked wide+faint then thin+bright for a cheap neon glow
    ctx.strokeStyle = NEON;
    ctx.beginPath();
    for (const [a, b] of edges) line(rotate(q, a), rotate(q, b));
    line(rotate(q, boresight[0]), rotate(q, boresight[1]));
    ctx.globalAlpha = 0.18; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.stroke();

    // readouts at ~10 Hz
    const now = performance.now();
    if (now - lastText < 100 && phase === lastPhase) return;
    lastText = now; lastPhase = phase;
    const err = errAngle(q, qT) * 180 / Math.PI;
    out.mode.textContent = phase;
    out.mode.classList.toggle("lock", phase === "LOCK");
    out.q.textContent = q.map(fmt).join(" ");
    out.w.textContent = `${wDeg.toFixed(3)} °/s`;
    out.err.textContent = `${err.toFixed(3)} °`;
    const el = Math.floor((now - t0) / 1000);
    out.t.textContent = `${pad(Math.floor(el / 3600))}:${pad(Math.floor(el / 60) % 60)}:${pad(el % 60)}`;
  };

  if (reduceMotion) {
    qT = q = qnorm([0.82, 0.31, -0.28, 0.39]);
    phase = "LOCK";
    render();
    return;
  }

  // run only while the console is on screen; no rAF at all when it isn't
  let running = false, last = 0;
  const loop = (now) => {
    if (!running) return;
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    render();
    requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
    else if (!e.isIntersecting) running = false;
  }).observe(canvas);
})();
