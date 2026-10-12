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
  // rotation angle between two attitudes; atan2 keeps precision near zero where acos does not
  const errAngle = (a, b) => { const d = qmul(qconj(a), b); return 2 * Math.atan2(Math.hypot(d[1], d[2], d[3]), Math.abs(d[0])); };
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
  // A small spacecraft (1 unit = 1 m) slews between random targets. Each slew shows one
  // capability card's view of the same motion; everything drawn and printed comes from one state.
  const canvas = document.getElementById("att");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = 360, H = 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const out = {};
  for (const k of ["mode", "q", "w", "err", "tip", "lk", "lv", "t"]) out[k] = document.getElementById("t-" + k);
  const cards = document.querySelectorAll(".caps li");
  const css = getComputedStyle(document.querySelector(".console .crt"));
  const PHOS = css.getPropertyValue("--c").trim() || "#7cf3a2";
  const DIM = css.getPropertyValue("--cd").trim() || "#3f9563";
  const root = getComputedStyle(document.documentElement);
  const AMBER = root.getPropertyValue("--amber").trim() || "#ffb547", AMBER_DIM = root.getPropertyValue("--amber-dim").trim() || "#b07a2e";

  const add = (a, b) => a.map((c, i) => c + b[i]);
  const scl = (a, k) => a.map((c) => c * k);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (v) => scl(v, 1 / Math.hypot(...v));
  const qexp = (r) => { const n = Math.hypot(...r); return n < 1e-12 ? [1, 0, 0, 0] : qaxis(scl(r, 1 / n), n); };
  const D = 180 / Math.PI;

  // Spacecraft wireframe in body axes: bus, two solar wings on ±y, boresight on +z.
  // Wing points carry their span station so the flex mode can bend them.
  const edges = [];
  const box = (sx, sy, sz) => {
    const v = [];
    for (const x of [-sx, sx]) for (const y of [-sy, sy]) for (const z of [-sz, sz]) v.push([x, y, z]);
    [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
      .forEach(([a, b]) => edges.push([v[a], v[b]]));
  };
  box(0.45, 0.45, 0.55);
  const ROOT = 0.5, SPAN = 1.2;
  const wingEdges = [];
  for (const s of [1, -1]) {
    const seg = (a, b) => wingEdges.push([a, b]);
    for (const z of [0.02, -0.02]) {
      for (const x of [0.32, -0.32]) for (let i = 0; i < 8; i++) seg([x, s * (ROOT + SPAN * i / 8), z], [x, s * (ROOT + SPAN * (i + 1) / 8), z]);
      for (const y of [ROOT, ROOT + SPAN]) seg([-0.32, s * y, z], [0.32, s * y, z]);
    }
    for (const x of [0.32, -0.32]) for (const y of [ROOT, ROOT + SPAN]) seg([x, s * y, 0.02], [x, s * y, -0.02]);
    for (const y of [0.8, 1.1, 1.4]) seg([-0.32, s * y, 0], [0.32, s * y, 0]);
    edges.push([[0, s * 0.45, 0], [0, s * 0.5, 0]]);
  }
  const BORE = 1.6, EST_DEF = 4;
  const boresight = [[0, 0, 0.55], [0, 0, BORE]];
  // star tracker on the bus's −x face, looking up and back; stars are fixed inertial directions
  const TRK = { at: [-0.45, 0.15, 0.35], dir: unit([-1, 0.3, 1]) };
  const STARS = Array.from({ length: 14 }, (_, i) => {
    const zz = 1 - (2 * i + 1) / 14, rr = Math.sqrt(1 - zz * zz), a = i * 2.39996 + 0.7;
    return scl([rr * Math.cos(a), rr * Math.sin(a), zz], 2.2);
  });

  // First wing bending mode, antisymmetric: the tips lag the bus's angular acceleration.
  // eta = [x, z] tip deflection in metres; shape is the uniform-load cantilever curve.
  // the f₁ lens draws the deformation scaled up, as on an FE mode-shape plot; TIP stays true
  const FLEX = { f: 0.4, zeta: 0.2, gain: 1.1, kappa: 0.05, def: 3 };
  const wn = 2 * Math.PI * FLEX.f;
  // ringing amplitude of the tip, independent of where in the cycle it is
  const amp = () => Math.hypot(eta[0], eta[1], etaD[0] / wn, etaD[1] / wn);
  const bend = ([x, y, z], eta) => {
    const u = Math.max(0, (Math.abs(y) - ROOT) / SPAN), phi = (u ** 4 - 4 * u ** 3 + 6 * u * u) / 3, s = Math.sign(y) * phi;
    return [x + s * eta[0], y, z + s * eta[1]];
  };

  // Four reaction wheels in a pyramid; they absorb the body's momentum, plus a null-space bias.
  const J = [60, 25, 55], IW = 0.25, BIAS = 1200, RPM = 60 / (2 * Math.PI);
  const ce = Math.cos(0.6155), se = Math.sin(0.6155);
  const WA = [45, 135, 225, 315].map((p) => [ce * Math.cos(p / D), ce * Math.sin(p / D), se]);
  // Momentum envelope: every total wheel momentum the pyramid can hold with each wheel inside
  // ±3000 rpm, a zonotope of 12 parallelogram faces, fixed in the body. Display scale KH puts
  // its extent at 1.5 units; edges are deduplicated once here.
  const HMAX = IW * 3000 / RPM, KH = 1.5 / (4 * se * HMAX), G = WA.map((a) => scl(a, HMAX * KH));
  const envEdges = (() => {
    const out = new Map();
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const n = cross(G[i], G[j]);
      for (const sg of [1, -1]) {
        let c = [0, 0, 0];
        for (let k = 0; k < 4; k++) if (k !== i && k !== j) c = add(c, scl(G[k], sg * Math.sign(dot(n, G[k]))));
        const P = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => add(c, add(scl(G[i], a), scl(G[j], b))));
        P.forEach((p, k) => {
          const e = [p, P[(k + 1) % 4]], key = e.map((v) => v.map((x) => x.toFixed(3)).join()).sort().join("|");
          out.set(key, e);
        });
      }
    }
    return [...out.values()];
  })();
  const wheelRpm = (w) => {
    const h = [-J[0] * w[0] / (2 * ce * ce), -J[1] * w[1] / (2 * ce * ce), -J[2] * w[2] / (4 * se * se)];
    return WA.map((a, i) => (a[0] * h[0] + a[1] * h[1] + a[2] * h[2]) / IW * RPM + (i % 2 ? -BIAS : BIAS));
  };

  // Fixed camera: tilt the inertial frame so the view isn't face-on.
  const cam = qmul(qaxis([1, 0, 0], -1.05), qaxis([0, 0, 1], 0.6));
  const project = (v) => {
    const p = rotate(cam, v);
    const d = 5.2, f = 300 / (d - p[1]);
    return [W / 2 + p[0] * f * 0.95, H / 2 - p[2] * f * 0.95];
  };
  const line = (a, b) => { const [x1, y1] = project(a), [x2, y2] = project(b); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); };
  const poly = (pts) => pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));

  // Lenses: one per slew, in card order.
  const LENSES = [
    { key: "guid", card: 0, label: "PLAN" },
    { key: "est", card: 1, label: "3σ" },
    { key: "ctrl", card: 2, label: "RW" },
    { key: "flex", card: 3, label: "f₁" },
    { key: "fsw", card: 4, label: "UP" },
    { key: "mc", card: 5, label: "MC" },
  ];
  let lens = null, lensN = -1;
  // Path search: two rival routes to the same target run alongside the flown eigenaxis slew,
  // the long way round the same axis and a yaw-pitch-roll Euler sequence. Drawn as a
  // superposition: the craft splits into three faint blurred copies, each tracing its own
  // boresight path. The flown one, the shortest rotation, brightens and sharpens through the
  // slew while the others fade, the one that turns furthest first. mcW holds each copy's brightness.
  let mcW = [1, 0, 0], mcPts = [];
  const setLens = (n) => {
    lensN = n; lens = LENSES[n];
    cards.forEach((c, i) => c.classList.toggle("on", i === lens.card));
  };
  // A click on a card queues its lens for the next slew. One slot, latest click wins, so
  // mashing the cards can't stack anything up; the current slew always finishes first.
  let queued = -1;
  const nextN = () => (queued >= 0 ? queued : (lensN + 1) % LENSES.length);
  const takeNext = () => {
    const n = nextN();
    queued = -1; cards.forEach((c) => c.classList.remove("queued"));
    return n;
  };
  // Flight software: before its slew the command load is uplinked from a ground station
  // at the lower right, as packets of bits (filled = 1) streaming into the bus.
  const UP = { packets: 8, every: 0.3, travel: 1.4, bits: 8 };
  let uplink = null;
  const startUplink = () => {
    setLens(takeNext());
    uplink = { t: 0, bytes: Array.from({ length: UP.packets }, () => Math.floor(Math.random() * 256)) };
  };
  const arrived = () => (uplink ? Math.max(0, Math.min(UP.packets, Math.floor((uplink.t - UP.travel) / UP.every) + 1)) : 0);

  // ---- state ----
  let q = [1, 0, 0, 0], qc = q, q0 = q, qT = q, slew = null, phase = "INIT", phaseT = 0, tEnd = 0, slewT = 0;
  let eta = [0, 0], etaD = [0, 0], wb = [0, 0, 0], wDeg = 0;
  let hPath = [];
  let est = { e: [0, 0, 0], s3: 0.003 / D, sf: 0, st: true };
  let plan = [], eig = null, runs = [], wob = [[1, 0, 0], [0, 1, 0]];
  const t0 = performance.now();

  const planPath = () => {
    plan = [];
    for (let k = 0; k <= 48; k++) plan.push(project(rotate(qmul(q0, qaxis(slew.axis, slew.ang * k / 48)), [0, 0, BORE])));
    const ax = rotate(q0, slew.axis);
    eig = [scl(ax, 1.9), scl(ax, -1.9)];
  };

  const newSlew = (advance = true) => {
    q0 = qc;
    const next = advance ? LENSES[nextN()].key : null, flexNext = next === "flex";
    let axis, ang, best = -1;
    // Some lenses pick their target for what they need to show. f₁: a big slew across the wings
    // (that is what bends them), ending with the bend side-on to the camera. MC: a boresight path
    // that sweeps across the screen rather than toward the viewer, so the rival paths can part.
    const score = (qq, aa) => {
      if (flexNext) {
        const d = scl(unit([aa.axis[2], 0, -aa.axis[0]]), 0.2), tip = [0, ROOT + SPAN, 0];
        const [x1, y1] = project(rotate(qq, tip)), [x2, y2] = project(rotate(qq, add(tip, d)));
        return Math.hypot(x2 - x1, y2 - y1) * Math.hypot(aa.axis[0], aa.axis[2]) * Math.min(1, aa.ang / (90 / D));
      }
      let len = 0, p = project(rotate(q0, [0, 0, BORE]));
      for (let k = 1; k <= 12; k++) {
        const n = project(rotate(qmul(q0, qaxis(aa.axis, aa.ang * k / 12)), [0, 0, BORE]));
        len += Math.hypot(n[0] - p[0], n[1] - p[1]); p = n;
      }
      // and a slew well short of 180°, so the long way round is plainly the longer route
      return aa.ang > 70 / D && aa.ang < 130 / D ? len : len / 10;
    };
    for (let k = 0; k < (flexNext || next === "mc" ? 60 : 1); k++) {
      const qq = randomQ(), aa = toAxisAngle(qmul(qconj(q0), qq)), sc = score(qq, aa);
      if (sc > best) { best = sc; qT = qq; ({ axis, ang } = aa); }
    }
    // ~45°/s average, it's a demo; the f₁ slew runs hotter so the arrays ring after it, and the
    // RW slew hotter still so the momentum path reaches well into the envelope
    const dur = (2.2 + (ang * D) / 45) * (flexNext ? 0.85 : next === "ctrl" ? 0.7 : 1);
    slew = { axis, ang, dur };
    hPath = [];
    phase = "SLEW"; phaseT = 0; slewT = 0;
    if (advance) { setLens(takeNext()); uplink = null; }
    planPath();
    // gyro scale factor before calibration: 2–3.5 % either sign
    est.sf = (Math.random() < 0.5 ? -1 : 1) * (0.02 + 0.015 * Math.random());
    // rival routes, as functions of the slew's progress c (0..1), in order of total rotation
    const [w, x, y, z] = qmul(qconj(q0), qT);
    const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    const tht = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
    const phi = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    runs = [
      { tot: 2 * Math.PI - ang, at: (c) => qmul(q0, qaxis(scl(axis, -1), (2 * Math.PI - ang) * c)) },
      { tot: Math.abs(psi) + Math.abs(tht) + Math.abs(phi), at: (c) => qmul(q0, qmul(qaxis([0, 0, 1], psi * smooth(0, 1, 3 * c)),
        qmul(qaxis([0, 1, 0], tht * smooth(1, 2, 3 * c)), qaxis([1, 0, 0], phi * smooth(2, 3, 3 * c))))) },
    ].sort((a, b) => a.tot - b.tot).map((r) => ({ ...r, q: null, pts: [] }));
    mcPts = [];
    wob = [unit(randomQ().slice(1)), unit(randomQ().slice(1))];
  };

  const step = (dt) => {
    const prev = q;
    phaseT += dt; slewT += dt;
    let alpha = [0, 0, 0];
    if (phase === "INIT" && phaseT > 0.8) newSlew();
    else if (phase === "SLEW") {
      const s = Math.min(1, phaseT / slew.dur);
      const th = slew.ang * (s - Math.sin(2 * Math.PI * s) / (2 * Math.PI));
      alpha = scl(slew.axis, slew.ang * 2 * Math.PI * Math.sin(2 * Math.PI * s) / (slew.dur * slew.dur));
      qc = qmul(q0, qaxis(slew.axis, th));
      if (lens.key === "mc") {
        const split = smooth(0, 0.12, s);
        mcW = [1 - 0.6 * split * (1 - smooth(0.15, 0.95, s)), 0.3 * split * (1 - smooth(0.3, 0.85, s)), 0.2 * split * (1 - smooth(0.2, 0.65, s))];
      }
      if (lens.key === "mc") for (const r of runs) {
        r.q = r.at(th / slew.ang);
        r.pts.push(project(rotate(r.q, [0, 0, BORE])));
      }
      if (lens.key === "mc") mcPts.push(project(rotate(qc, [0, 0, BORE])));
      if (s >= 1) { phase = "SETTLE"; phaseT = 0; tEnd = 0; qc = qT; mcW = [1, 0, 0]; for (const r of runs) r.q = null; }
    } else if (phase === "SETTLE") {
      if ((phaseT > 0.6 && amp() < 0.005) || phaseT > (lens && lens.key === "flex" ? 7 : 5)) { phase = "LOCK"; phaseT = 0; }
    } else if (phase === "LOCK" && uplink && arrived() < UP.packets) {
      uplink.t += dt;
      if (arrived() === UP.packets) { phaseT = 2.2; } // hold briefly, then execute the load
    } else if (phase === "LOCK" && phaseT > 2.6) {
      if (LENSES[nextN()].key === "fsw" && !uplink) { startUplink(); phaseT = 0; }
      else if (uplink && !uplink.sent) { uplink.sent = true; newSlew(false); } // execute the uplinked load
      else newSlew();
    }
    if (phase === "SETTLE" || phase === "LOCK") tEnd += dt;

    // flex mode, sub-stepped: driven by the commanded angular acceleration in body axes
    const n = Math.ceil(dt / 0.004), h = dt / n;
    const force = [FLEX.gain * alpha[2], -FLEX.gain * alpha[0]];
    for (let k = 0; k < n; k++) for (const i of [0, 1]) {
      etaD[i] += h * (force[i] - 2 * FLEX.zeta * wn * etaD[i] - wn * wn * eta[i]);
      eta[i] += h * etaD[i];
    }
    // the bus reacts against the bending wings, and holds with a small wobble once settled
    const b = 4e-5 * (1 - Math.exp(-tEnd)) * Math.sin(2 * Math.PI * 0.7 * tEnd);
    q = qmul(qmul(qc, qexp([-FLEX.kappa * eta[1], 0, FLEX.kappa * eta[0]])), qaxis(wob[0], b));

    // body rate, measured from the attitude actually drawn
    if (dt > 0) {
      const d = qmul(qconj(prev), q), ang = errAngle(prev, q), v = d.slice(1), nv = Math.hypot(...v);
      wb = nv > 1e-15 ? scl(v, (Math.sign(d[0]) || 1) * ang / nv / dt) : [0, 0, 0];
      wDeg = ang / dt * D;
    }

    // the wheels hold what the body doesn't: h = −Jω, in body axes, at the envelope's scale
    if (lens && lens.key === "ctrl" && phase !== "LOCK") hPath.push(wb.map((w, i) => -J[i] * w * KH));

    // estimator: the star tracker drops out above 1 °/s; the gyro then integrates its scale-factor error
    est.st = wDeg < 1;
    if (est.st) {
      const k = Math.exp(-dt / 0.25);
      est.e = scl(est.e, k); est.s3 = 0.003 / D + (est.s3 - 0.003 / D) * k;
    } else {
      est.e = add(est.e, scl(wb, est.sf * dt)); est.s3 += 0.06 * Math.hypot(...wb) * dt;
    }

  };

  let lastText = 0, lastPhase = "";
  const fmt = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4);
  const sgn = (x, d) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
  const render = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    const L = lens && lens.key;

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

    // lens overlays, all in the dim phosphor so the spacecraft stays the brightest thing
    ctx.globalAlpha = 0.9;
    if (L === "guid" && plan.length) {
      ctx.setLineDash([2, 3]); ctx.beginPath(); poly(plan); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); line(...eig); ctx.stroke();
    } else if (L === "mc") {
      // every copy's boresight path, as bright as its copy; the flown one lingers after the slew
      ctx.setLineDash([1, 3]);
      runs.forEach((r, i) => { ctx.globalAlpha = 1.6 * mcW[i + 1]; ctx.beginPath(); poly(r.pts); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6 * (phase === "SLEW" ? mcW[0] : Math.max(0, 1 - tEnd / 1.2));
      ctx.beginPath(); poly(mcPts); ctx.stroke();
    } else if (L === "flex") {
      ctx.beginPath();
      for (const [a, b] of wingEdges) line(rotate(q, a), rotate(q, b));
      ctx.stroke();
    } else if (L === "est") {
      // star field; while the tracker holds, sight lines run from it to the three stars nearest
      // its boresight and each is boxed; above 1 °/s they drop and the field dims
      const td = rotate(q, TRK.dir), at = rotate(q, TRK.at);
      ctx.globalAlpha = est.st ? 0.9 : 0.45;
      ctx.beginPath();
      for (const st of STARS) { const [x, y] = project(st); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); }
      ctx.stroke();
      if (est.st) {
        const near = [...STARS].sort((a, b) => dot(b, td) - dot(a, td)).slice(0, 3);
        ctx.setLineDash([2, 3]); ctx.beginPath();
        for (const st of near) line(at, st);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath();
        for (const st of near) { const [x, y] = project(st); ctx.rect(x - 5.5, y - 5.5, 11, 11); }
        ctx.stroke();
      }
    } else if (L === "fsw" && uplink && arrived() < UP.packets) {
      // ground station at the lower right; bits ride the link into the bus, 1 filled, 0 hollow
      const [gx, gy] = [W - 18, H - 18], [bx, by] = project([0, 0, 0]);
      const len = Math.hypot(bx - gx, by - gy), ux = (bx - gx) / len, uy = (by - gy) / len;
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(gx, gy, 7, Math.PI, 1.5 * Math.PI); ctx.moveTo(gx, gy); ctx.lineTo(gx + 5, gy + 5); ctx.stroke();
      ctx.fillStyle = PHOS; ctx.strokeStyle = PHOS;
      uplink.bytes.forEach((byte, i) => {
        const f = (uplink.t - i * UP.every) / UP.travel;
        if (f <= 0 || f >= 1) return;
        for (let k = 0; k < UP.bits; k++) {
          const d = f * len - k * 4.5;
          if (d < 0 || d > len - 8) continue;
          const x = gx + ux * d - 1.5, y = gy + uy * d - 1.5;
          (byte >> k) & 1 ? ctx.fillRect(x, y, 3, 3) : ctx.strokeRect(x + 0.5, y + 0.5, 2, 2);
        }
      });
      ctx.strokeStyle = DIM;
    } else if (L === "ctrl") {
      // the momentum envelope, in amber, turning with the body
      ctx.strokeStyle = AMBER_DIM; ctx.globalAlpha = 0.55; ctx.beginPath();
      for (const [a, b] of envEdges) line(rotate(q, a), rotate(q, b));
      ctx.stroke();
      ctx.strokeStyle = DIM;
    }
    ctx.globalAlpha = 1;

    // spacecraft: one path, stroked wide+faint then thin+bright for a cheap phosphor glow
    ctx.strokeStyle = PHOS;
    const craft = (qq) => {
      ctx.beginPath();
      for (const [a, b] of edges) line(rotate(qq, a), rotate(qq, b));
      const e = L === "flex" ? scl(eta, FLEX.def) : eta;
      for (const [a, b] of wingEdges) line(rotate(qq, bend(a, e)), rotate(qq, bend(b, e)));
      line(rotate(qq, boresight[0]), rotate(qq, boresight[1]));
    };
    if (!(L === "mc" && phase === "SLEW")) {
      craft(q);
      ctx.globalAlpha = 0.18; ctx.lineWidth = 5; ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.stroke();
    } else {
      // superposition: wide soft strokes carry a faint copy, so it reads blurred; the sharp core
      // comes in with the square of its brightness, so only the likeliest copy turns crisp
      [q, ...runs.map((r) => r.q)].forEach((qq, i) => {
        const b = mcW[i];
        if (!qq || b < 0.01) return;
        craft(qq);
        ctx.globalAlpha = 0.16 * b; ctx.lineWidth = 7; ctx.stroke();
        ctx.globalAlpha = 0.3 * b; ctx.lineWidth = 3; ctx.stroke();
        ctx.globalAlpha = b * b; ctx.lineWidth = 1.4; ctx.stroke();
      });
    }
    if (L === "ctrl") {
      // the momentum path so far, and where it is now
      if (hPath.length > 1) {
        ctx.strokeStyle = AMBER; ctx.fillStyle = AMBER; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.6;
        ctx.beginPath(); poly(hPath.map((h) => project(rotate(q, h)))); ctx.stroke();
        const [x, y] = project(rotate(q, hPath[hPath.length - 1]));
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.strokeStyle = PHOS; ctx.lineWidth = 1;
    }
    if (L === "est") {
      // the estimate, its error drawn ×4, dashed, with its 3σ ring at the boresight tip
      const qe = qmul(q, qexp(scl(est.e, EST_DEF))), dir = rotate(qe, [0, 0, 1]);
      const u = unit(cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), v = cross(dir, u);
      const c = scl(dir, BORE), r = BORE * Math.tan(Math.min(1, EST_DEF * est.s3));
      ctx.setLineDash([3, 3]); craft(qe); ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * 2 * Math.PI, [x, y] = project(add(c, add(scl(u, r * Math.cos(a)), scl(v, r * Math.sin(a)))));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // readouts, throttled: text with glow is costly to repaint
    const now = performance.now();
    if (now - lastText < 100 && phase === lastPhase) return;
    lastText = now; lastPhase = phase;
    const err = errAngle(q, qT) * D;
    out.mode.textContent = phase;
    out.mode.classList.toggle("lock", phase === "LOCK");
    out.q.textContent = [q[1], q[2], q[3], q[0]].map(fmt).join(" "); // scalar last: x y z w
    out.w.textContent = `${wDeg.toFixed(3)} °/s`;
    out.err.textContent = `${err.toFixed(3)} °`;
    out.tip.textContent = `${(Math.hypot(...eta) * 1000).toFixed(1)} mm`;
    if (lens) {
      out.lk.textContent = lens.label;
      out.lv.textContent =
        L === "guid" ? `${(slew.ang * D).toFixed(1)} ° in ${slew.dur.toFixed(1)} s` :
        L === "est" ? `${(est.s3 * D).toFixed(3)} ° ${est.st ? "ST+GYRO" : "GYRO"} ×${EST_DEF}` :
        L === "ctrl" ? wheelRpm(wb).map((w) => sgn(w / 1000, 1)).join(" ") + " krpm" :
        L === "flex" ? `${FLEX.f.toFixed(2)} Hz ζ ${FLEX.zeta.toFixed(2)} ×${FLEX.def}` :
        L === "fsw" ? (arrived() < UP.packets ? `PKT ${arrived()}/${UP.packets}` : `${UP.packets}/${UP.packets} CRC OK · EXEC`) :
        [slew.ang, ...runs.map((r) => r.tot)].map((a) => `${(a * D).toFixed(0)}°`).join(" ");
    }
    const el = Math.floor((performance.now() - t0) / 1000);
    out.t.textContent = `${pad(Math.floor(el / 3600))}:${pad(Math.floor(el / 60) % 60)}:${pad(el % 60)}`;
  };

  if (reduceMotion) {
    // one still frame, held on target, with the guidance plan that got it there
    qT = qc = q = qnorm([0.82, 0.31, -0.28, 0.39]);
    const { axis, ang } = toAxisAngle(qT);
    slew = { axis, ang, dur: 2.2 + (ang * D) / 45 };
    lens = LENSES[0]; cards[0] && cards[0].classList.add("on");
    planPath();
    phase = "LOCK";
    render();
    return;
  }

  cards.forEach((c, i) => {
    const n = LENSES.findIndex((l) => l.card === i);
    if (n < 0) return;
    c.tabIndex = 0; c.setAttribute("role", "button"); c.title = "Show this on the console next";
    const pick = () => {
      queued = n;
      cards.forEach((o) => o.classList.toggle("queued", o === c));
    };
    c.addEventListener("click", pick);
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });

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
