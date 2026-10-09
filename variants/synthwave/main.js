// Freeside Labs — variant C: Monte Carlo ridgelines over a grid floor, plus the attitude console.
"use strict";

(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- UTC clock / year ----
  const utc = document.getElementById("utc");
  const pad = (n) => String(n).padStart(2, "0");
  const tick = () => {
    const d = new Date();
    utc.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
  document.getElementById("year").textContent = new Date().getFullYear();

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // =====================================================================
  // Hero: pointing-error traces from a Monte Carlo of a fine-pointing hold.
  // Single-axis rigid body + one flexible mode, PD control, wheel harmonic,
  // sensor noise, and a wheel zero-crossing (stiction) torque pulse mid-run.
  // Each band is one Monte Carlo set; each line is one dispersed run.
  // =====================================================================
  const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = mulberry32(19140806);
  const U = (lo, hi) => lo + (hi - lo) * rng();
  const N01 = () => { const u = 1 - rng(), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  const BANDS = [
    // per-band case: flex frequency (Hz), flex damping, noise, stiction size
    { flexHz: [0.45, 0.6], zf: [0.02, 0.04], noise: 0.05, kick: 1.0, front: [255, 77, 109], back: [255, 196, 214] },
    { flexHz: [0.3, 0.42], zf: [0.008, 0.015], noise: 0.04, kick: 0.9, front: [217, 70, 239], back: [190, 170, 255] },
    { flexHz: [0.55, 0.8], zf: [0.02, 0.03], noise: 0.08, kick: 1.1, front: [255, 216, 74], back: [255, 160, 110] },
    { flexHz: [0.38, 0.5], zf: [0.01, 0.02], noise: 0.05, kick: 0.8, front: [62, 240, 230], back: [165, 180, 252] },
  ];
  const RUNS = 7, T = 24, DT = 0.02, KEEP = 4; // 1200 steps, keep every 4th -> 300 points

  const simulate = (band) => {
    const wn = 0.55 * U(0.85, 1.15), z = 0.7 * U(0.85, 1.15);
    const Kp = wn * wn, Kd = 2 * z * wn;
    const Om = 2 * Math.PI * U(...band.flexHz), zf = U(...band.zf), kap = U(0.45, 0.8), part = 0.35;
    const fh = U(0.7, 1.3), ah = U(0.015, 0.03), ph = U(0, 2 * Math.PI);
    const t0 = T / 2 + N01() * 1.4, kick = band.kick * U(0.75, 1.25) * (rng() < 0.15 ? -1 : 1);
    let th = N01() * 0.05, w = 0, eta = 0, etad = 0, ef = 0;
    const out = [];
    for (let i = 0; i < T / DT; i++) {
      const t = i * DT;
      const meas = th + part * eta + band.noise * 0.25 * N01();
      ef += (meas - ef) * 0.35; // light sensor filtering
      const u = -Kp * ef - Kd * w;
      const dist = ah * Math.sin(2 * Math.PI * fh * t + ph) + (t > t0 && t < t0 + 0.5 ? kick * 0.6 : 0);
      const acc = u + dist;
      w += acc * DT; th += w * DT;
      etad += (-2 * zf * Om * etad - Om * Om * eta - kap * acc) * DT; eta += etad * DT;
      if (i % KEEP === 0) out.push(th + part * eta + band.noise * N01() * 0.16);
    }
    return out;
  };
  const traces = BANDS.map((b) => {
    const runs = Array.from({ length: RUNS }, () => simulate(b));
    const peak = Math.max(...runs.flat().map(Math.abs));
    return runs.map((r) => r.map((v) => v / peak));
  });

  const art = document.querySelector(".hero__art");
  const ridges = document.getElementById("ridges");
  const grid = document.getElementById("grid");
  if (art && ridges && grid) {
    const rc = ridges.getContext("2d"), gc = grid.getContext("2d");
    let W = 0, H = 0, reveal = reduceMotion ? 1 : 0, revealStart = 0, gridGrad = null;

    const size = () => {
      const r = art.getBoundingClientRect();
      W = r.width; H = r.height;
      for (const c of [ridges, grid]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
      rc.setTransform(DPR, 0, 0, DPR, 0, 0);
      gc.setTransform(DPR, 0, 0, DPR, 0, 0);
      gridGrad = gc.createLinearGradient(0, H * 0.6, 0, H);
      gridGrad.addColorStop(0, "rgba(62,240,230,0)");
      gridGrad.addColorStop(0.35, "rgba(62,240,230,.28)");
      gridGrad.addColorStop(1, "rgba(62,240,230,.7)");
    };

    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const drawRidges = (frac) => {
      rc.clearRect(0, 0, W, H);
      const span = W * 0.62, bandGap = H * 0.19, amp = H * 0.065;
      const dx = W * 0.028, dy = H * 0.011;
      const n = Math.max(2, Math.floor(frac * 300));
      rc.lineJoin = "round"; rc.lineCap = "round";
      BANDS.forEach((band, b) => {
        const baseY = H * 0.2 + b * bandGap;
        for (let k = RUNS - 1; k >= 0; k--) { // back to front
          const tr = traces[b][k];
          const x0 = W * 0.1 + k * dx, y0 = baseY - k * dy;
          const [r, g, bl] = mix(band.front, band.back, k / (RUNS - 1));
          rc.beginPath();
          for (let i = 0; i < n; i++) {
            const x = x0 + (i / 299) * span, y = y0 - tr[i] * amp;
            i ? rc.lineTo(x, y) : rc.moveTo(x, y);
          }
          const a = 1 - (k / (RUNS - 1)) * 0.45;
          rc.strokeStyle = `rgba(${r},${g},${bl},${(0.1 * a).toFixed(3)})`; rc.lineWidth = 7; rc.stroke();
          rc.strokeStyle = `rgba(${r},${g},${bl},${(0.25 * a).toFixed(3)})`; rc.lineWidth = 3.2; rc.stroke();
          rc.strokeStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, bl + 40)},${a.toFixed(3)})`; rc.lineWidth = 1.3; rc.stroke();
        }
      });
    };

    const drawGrid = (phase) => {
      gc.clearRect(0, 0, W, H);
      const hy = H * 0.6, vx = W / 2;
      // horizon haze
      const haze = gc.createLinearGradient(0, hy - H * 0.06, 0, hy + H * 0.04);
      haze.addColorStop(0, "rgba(255,62,165,0)");
      haze.addColorStop(0.6, "rgba(255,62,165,.16)");
      haze.addColorStop(1, "rgba(255,62,165,0)");
      gc.fillStyle = haze; gc.fillRect(0, hy - H * 0.06, W, H * 0.1);
      gc.strokeStyle = gridGrad; gc.lineWidth = 1;
      gc.beginPath();
      for (let k = 0; k < 18; k++) { // receding horizontals
        const d = k + (1 - phase);
        const y = hy + (H - hy) / (1 + d * 0.55);
        gc.moveTo(0, y); gc.lineTo(W, y);
      }
      for (let n = -14; n <= 14; n++) { // converging verticals
        gc.moveTo(vx + n * W * 0.012, hy); gc.lineTo(vx + n * W * 0.16, H);
      }
      gc.stroke();
      gc.strokeStyle = "rgba(255,62,165,.55)";
      gc.beginPath(); gc.moveTo(0, hy); gc.lineTo(W, hy); gc.stroke();
    };

    size(); drawGrid(0); drawRidges(reveal);
    new ResizeObserver(() => { size(); drawGrid(0); drawRidges(reveal); }).observe(art);

    if (!reduceMotion) {
      let visible = true, lastGrid = 0;
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(art);
      const loop = (now) => {
        if (visible) {
          if (reveal < 1) {
            if (!revealStart) revealStart = now;
            reveal = Math.min(1, (now - revealStart) / 1800);
            drawRidges(1 - Math.pow(1 - reveal, 3));
          }
          if (now - lastGrid > 33) { drawGrid((now / 4000) % 1); lastGrid = now; } // ~30 fps is plenty
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  // =====================================================================
  // Console: rest-to-rest eigenaxis slews of a wireframe spacecraft.
  // =====================================================================
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

  const canvas = document.getElementById("att");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = 360, H = 300;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  const out = {
    mode: document.getElementById("t-mode"),
    q: document.getElementById("t-q"),
    w: document.getElementById("t-w"),
    err: document.getElementById("t-err"),
    t: document.getElementById("t-t"),
  };
  const css = getComputedStyle(document.querySelector(".console .crt"));
  const LINE = css.getPropertyValue("--c").trim() || "#3ef0e6";
  const DIM = css.getPropertyValue("--cd").trim() || "#2a8f9a";
  const TARGET = "#ff3ea5";

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
    const dur = 2.2 + (ang * 180 / Math.PI) / 45; // ~45°/s average, it's a demo
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
    ctx.strokeStyle = DIM;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * 2 * Math.PI, [x, y] = project([2 * Math.cos(a), 2 * Math.sin(a), 0]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    line([-2.2, 0, 0], [2.2, 0, 0]); line([0, -2.2, 0], [0, 2.2, 0]); line([0, 0, -1.6], [0, 0, 1.9]);
    ctx.stroke();

    // target boresight (dashed)
    ctx.strokeStyle = TARGET;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); line(rotate(qT, boresight[0]), rotate(qT, boresight[1]).map((c) => c * 1.15)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // spacecraft: one path, stroked wide+faint then thin+bright for a cheap glow
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    for (const [a, b] of edges) line(rotate(q, a), rotate(q, b));
    line(rotate(q, boresight[0]), rotate(q, boresight[1]));
    ctx.globalAlpha = 0.18; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.stroke();

    // readouts, throttled to ~10 Hz
    const now = performance.now();
    if (now - lastText < 100 && phase === lastPhase) return;
    lastText = now; lastPhase = phase;
    const err = errAngle(q, qT) * 180 / Math.PI;
    out.mode.textContent = phase;
    out.mode.classList.toggle("lock", phase === "LOCK");
    out.q.textContent = q.map(fmt).join(" ");
    out.w.textContent = `${wDeg.toFixed(3)} °/s`;
    out.err.textContent = `${err.toFixed(3)} °`;
    const el = Math.floor((performance.now() - t0) / 1000);
    out.t.textContent = `${pad(Math.floor(el / 3600))}:${pad(Math.floor(el / 60) % 60)}:${pad(el % 60)}`;
  };

  if (reduceMotion) {
    qT = q = qnorm([0.82, 0.31, -0.28, 0.39]);
    phase = "LOCK";
    render();
    return;
  }

  let visible = true, last = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = performance.now(); }).observe(canvas);
  const loop = (now) => {
    if (visible) {
      step(Math.min(0.05, (now - last) / 1000));
      render();
    }
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
