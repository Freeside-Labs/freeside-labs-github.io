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

  // ---- hero orbit: the satellite rides above the ring and is hidden only by the planet's disc ----
  const sat = document.getElementById("sat");
  const satLayer = document.getElementById("satLayer");
  const satNight = document.getElementById("satNight");
  const ORBIT = { cx: 200, cy: 200, rx: 185, ry: 62, tilt: -18 * Math.PI / 180, period: 14 };
  const PLANET_R = 92;

  // 3D frame for the art: x right, y down, z toward the viewer, origin at the planet.
  // The ring plane is spanned by u (along the long axis) and w (toward the viewer); n is its normal.
  const sinE = ORBIT.ry / ORBIT.rx, cosE = Math.sqrt(1 - sinE * sinE);
  const tc = Math.cos(ORBIT.tilt), ts = Math.sin(ORBIT.tilt);
  const tiltV = ([x, y, z]) => [x * tc - y * ts, x * ts + y * tc, z];
  const U = tiltV([1, 0, 0]), Wv = tiltV([0, sinE, cosE]), N = tiltV([0, -cosE, sinE]);
  const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  // Sun 24° above the ring plane, 8° round toward the viewer: points at the sun drawn upper
  // right (40° up from the planet) and still drops the planet's shadow across the back of the
  // ring, so the satellite sees eclipse.
  const SUN_AZ = 8 * Math.PI / 180, SUN_EL = 24 * Math.PI / 180;
  const SUN = [0, 1, 2].map((i) =>
    Math.cos(SUN_EL) * (Math.cos(SUN_AZ) * U[i] + Math.sin(SUN_AZ) * Wv[i]) + Math.sin(SUN_EL) * N[i]);
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ringPoint = (th) => [0, 1, 2].map((i) => ORBIT.rx * (Math.cos(th) * U[i] + Math.sin(th) * Wv[i]));
  // 1 deep in the planet's shadow, 0 in sunlight, soft over a few units of penumbra
  const umbra = (p) => {
    const k = dot3(p, SUN);
    if (k >= 0) return 0;
    const perp = Math.hypot(p[0] - k * SUN[0], p[1] - k * SUN[1], p[2] - k * SUN[2]);
    return 1 - smooth(PLANET_R - 10, PLANET_R + 10, perp);
  };

  // ---- planet shading: Lambert terminator, limb glow, and the ring's shadow, rendered once ----
  const shade = document.getElementById("planetShade");
  if (shade) {
    const SCALE = 3, S = 2 * PLANET_R * SCALE;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    const img = g.createImageData(S, S);
    const NIGHT = [3, 16, 14], RIM = [201, 255, 244];
    const nDotSun = dot3(N, SUN);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const nx = ((i + 0.5) / SCALE - PLANET_R) / PLANET_R, ny = ((j + 0.5) / SCALE - PLANET_R) / PLANET_R;
        const r2 = nx * nx + ny * ny;
        if (r2 > 1.04) continue;
        const nz = Math.sqrt(Math.max(0, 1 - r2));
        const lum = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
        // wide ramp: the sun is near edge-on, so a narrow one draws the terminator as a line
        let dark = 0.74 * (1 - smooth(-0.55, 0.55, lum));
        // ring shadow: walk from the surface toward the sun until the ring plane
        const P = [nx * PLANET_R, ny * PLANET_R, nz * PLANET_R];
        const t = -dot3(N, P) / nDotSun;
        if (t > 0) {
          const rho = Math.hypot(P[0] + t * SUN[0], P[1] + t * SUN[1], P[2] + t * SUN[2]);
          const band = 1 - smooth(2, 12, Math.abs(rho - ORBIT.rx));
          dark = 1 - (1 - dark) * (1 - 0.22 * band * smooth(0, 0.25, lum));
        }
        const rim = 0.45 * (1 - smooth(0, 0.22, nz)) * smooth(-0.05, 0.35, lum);
        const hi = 0.18 * smooth(0.7, 1, lum);
        // composite night, then rim glow, then sheen ("over")
        let a = dark, c = NIGHT.map((v) => v * dark);
        c = c.map((v, k) => RIM[k] * rim + v * (1 - rim)); a = rim + a * (1 - rim);
        c = c.map((v) => 255 * hi + v * (1 - hi)); a = hi + a * (1 - hi);
        const o = 4 * (j * S + i);
        if (a > 0) { img.data[o] = c[0] / a; img.data[o + 1] = c[1] / a; img.data[o + 2] = c[2] / a; }
        img.data[o + 3] = 255 * a;
      }
    }
    g.putImageData(img, 0, 0);
    shade.setAttribute("href", cv.toDataURL());
  }

  // ---- the planet's shadow across the back of the ring ----
  // One path drawn over the whole ring, so it wraps round the end without a seam; the mask
  // hides it where the back of the ring is behind the planet. The sun is on the viewer's side,
  // so no shadowed stretch of ring is ever in front of the planet.
  const ringShadow = document.getElementById("ringShadow");
  if (ringShadow) {
    const pts = [];
    for (let deg = 0; deg < 360; deg += 1) {
      const p = ringPoint(deg * Math.PI / 180);
      if (umbra(p) > 0) pts.push([ORBIT.cx + p[0], ORBIT.cy + p[1]]);
    }
    if (pts.length > 1) {
      ringShadow.setAttribute("d", "M" + pts.map((q) => q.map((v) => v.toFixed(1)).join(" ")).join(" L"));
      const [a, b] = [pts[0], pts[pts.length - 1]];
      const grad = document.getElementById("ringShadowGrad");
      grad.setAttribute("x1", a[0]); grad.setAttribute("y1", a[1]);
      grad.setAttribute("x2", b[0]); grad.setAttribute("y2", b[1]);
    }
  }

  const placeSat = (th) => {
    const ex = ORBIT.rx * Math.cos(th), ey = ORBIT.ry * Math.sin(th);
    const c = tc, s = ts;
    const x = ORBIT.cx + ex * c - ey * s, y = ORBIT.cy + ex * s + ey * c;
    if (satNight) satNight.setAttribute("opacity", (0.78 * umbra(ringPoint(th))).toFixed(2));
    // On the far half the planet occludes it. The switch happens at the ring's ends, well clear
    // of the disc, so it never shows; the ring itself never covers the satellite.
    const behind = ey < 0;
    if (behind !== satLayer.hasAttribute("mask")) {
      if (behind) satLayer.setAttribute("mask", "url(#offPlanet)"); else satLayer.removeAttribute("mask");
    }
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
  const css = getComputedStyle(document.querySelector(".console .crt"));
  const PHOS = css.getPropertyValue("--c").trim() || "#7cf3a2";
  const DIM = css.getPropertyValue("--cd").trim() || "#3f9563";

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
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); line(rotate(qT, boresight[0]), rotate(qT, boresight[1]).map((c) => c * 1.15)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // spacecraft: one path, stroked wide+faint then thin+bright for a cheap phosphor glow
    ctx.strokeStyle = PHOS;
    ctx.beginPath();
    for (const [a, b] of edges) line(rotate(q, a), rotate(q, b));
    line(rotate(q, boresight[0]), rotate(q, boresight[1]));
    ctx.globalAlpha = 0.18; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.stroke();

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
