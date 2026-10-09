// Freeside Labs — UTC clock + a small attitude simulation for the console.
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

  // ---- hero orbit: the satellite passes behind the planet on the far half ----
  const sat = document.getElementById("sat");
  const satBack = document.getElementById("satBack");
  const satFront = document.getElementById("satFront");
  const ORBIT = { cx: 200, cy: 200, rx: 185, ry: 62, tilt: -18 * Math.PI / 180, period: 14 };
  const placeSat = (th) => {
    const ex = ORBIT.rx * Math.cos(th), ey = ORBIT.ry * Math.sin(th);
    const c = Math.cos(ORBIT.tilt), s = Math.sin(ORBIT.tilt);
    const x = ORBIT.cx + ex * c - ey * s, y = ORBIT.cy + ex * s + ey * c;
    const behind = ey < 0; // far side of the ring
    const layer = behind ? satBack : satFront;
    if (sat.parentNode !== layer) layer.appendChild(sat);
    // tangent heading, plus a little foreshortening on the far side
    const tx = -ORBIT.rx * Math.sin(th), ty = ORBIT.ry * Math.cos(th);
    const ang = Math.atan2(tx * s + ty * c, tx * c - ty * s) * 180 / Math.PI;
    const k = 0.8 + 0.2 * Math.sin(th);
    sat.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${k.toFixed(3)})`);
  };
  if (sat) {
    if (reduceMotion) placeSat(2.6);
    else {
      const orbit = (now) => { placeSat((now / 1000 / ORBIT.period) * 2 * Math.PI); requestAnimationFrame(orbit); };
      requestAnimationFrame(orbit);
    }
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
  const css = getComputedStyle(document.querySelector(".console .neon"));
  const v = (name, fb) => css.getPropertyValue(name).trim() || fb;
  const RED = v("--n-red", "#ff3b5c"), MAG = v("--n-mag", "#e040fb"), ORG = v("--n-org", "#ffa53b"), CYAN = v("--n-cyan", "#36e3ff"), GRID = v("--n-violet", "#7b2ff7");

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

  const floor = document.createElement("canvas");
  floor.width = W * dpr; floor.height = H * dpr;
  {
    const f = floor.getContext("2d");
    f.scale(dpr, dpr);
    const fl = (a, b) => { const [x1, y1] = project(a), [x2, y2] = project(b); f.moveTo(x1, y1); f.lineTo(x2, y2); };
    f.strokeStyle = GRID; f.lineWidth = 1;
    f.beginPath();
    for (let k = -2; k <= 2.001; k += 0.5) { fl([k, -2, -0.9], [k, 2, -0.9]); fl([-2, k, -0.9], [2, k, -0.9]); }
    f.globalAlpha = 0.25; f.lineWidth = 4; f.stroke();
    f.globalAlpha = 0.9; f.lineWidth = 1; f.stroke();
    f.strokeStyle = MAG; f.globalAlpha = 0.45;
    f.beginPath(); fl([0, 0, -0.9], [0, 0, 1.9]); f.stroke();
  }
  const neon = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, H);
  neon.addColorStop(0, RED); neon.addColorStop(0.35, MAG); neon.addColorStop(0.7, ORG); neon.addColorStop(1, CYAN);

  const render = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(floor, 0, 0, W, H);

    // target boresight (dashed)
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); line(rotate(qT, boresight[0]), rotate(qT, boresight[1]).map((c) => c * 1.15)); ctx.stroke();
    ctx.setLineDash([]);

    // spacecraft: one path, stroked wide+faint then thin+bright for a cheap neon glow
    ctx.strokeStyle = neon;
    ctx.beginPath();
    for (const [a, b] of edges) line(rotate(q, a), rotate(q, b));
    line(rotate(q, boresight[0]), rotate(q, boresight[1]));
    ctx.globalAlpha = 0.22; ctx.lineWidth = 6; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.6; ctx.stroke();

    // readouts, throttled: text with glow is costly to repaint
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
    // one still frame, held on target
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
