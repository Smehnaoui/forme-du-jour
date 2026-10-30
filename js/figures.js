// Schémas des exercices : personnage articulé (vue de profil, de face ou de dos) + matériel, animé
// entre la position de départ (a) et d'arrivée (b) au tempo de l'exercice.
// Les membres sont posés par angles (a1/l1 = [segment haut, segment bas]) ou par cible (cinématique
// inverse : A1/L1 = [x, y, sens du coude/genou]). L'animation interpole membre par membre : cibles en
// ligne droite quand les deux poses en ont (pieds plantés, trajectoire de barre), sinon angles par le
// plus court chemin, ce qui évite les membres figés, les sauts et les bras qui traversent le corps.
// Angles en degrés, 0 = vers la droite (le sens du regard), 90 = vers le bas. Chevilles au sol à y = 90.
import { EXERCISES, MOVES } from "./exercises.js";

const LEN = { T: 24, UA: 14, FA: 14, TH: 19, SH: 19, HD: 9.5, HR: 5.3, SW: 7.5, HW: 4.6 };
const G = 90;          // chevilles au sol
const FLOOR = 92.6;    // ligne du sol, sous les semelles
const rad = (d) => (d * Math.PI) / 180;
const P = (p, a, l) => [p[0] + l * Math.cos(rad(a)), p[1] + l * Math.sin(rad(a))];
const ang = (p, q) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
const lerpN = (a, b, k) => a + (b - a) * k;
const lerpV = (a, b, k) => [lerpN(a[0], b[0], k), lerpN(a[1], b[1], k)];
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const f2 = (n) => Math.round(n * 100) / 100;
const pt = (p) => `${f2(p[0])},${f2(p[1])}`;

/** Angle interpolé par le plus court chemin, ou dans un sens imposé (`dir` = ±1). */
function angLerp(a, b, k, dir = 0) {
  let d = norm(b - a);
  if (dir > 0 && d < 0) d += 360;
  if (dir < 0 && d > 0) d -= 360;
  return a + d * k;
}

/** Deux segments (racine → milieu → bout) atteignant une cible ; `bend` choisit le côté du coude/genou. */
function ik(root, target, l1, l2, bend) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  const dist = Math.hypot(dx, dy) || 0.001;
  const ux = dx / dist, uy = dy / dist;
  const d = Math.min(dist, l1 + l2 - 0.01);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [[root[0] + ux * a - uy * h * bend, root[1] + uy * a + ux * h * bend], [root[0] + ux * d, root[1] + uy * d]];
}

function limb(root, angles, target, l1, l2, defBend, rel = 0) {
  if (target) return ik(root, target, l1, l2, target[2] ?? defBend);
  const [u, v] = angles || [90, 90];
  const mid = P(root, u + rel, l1);
  return [mid, P(mid, v + rel, l2)];
}

/** Pied à plat quand la cheville est au sol et le tibia à peu près vertical ; sinon cheville neutre. */
function footAngle(k, n) {
  const perp = ang(k, n) - 90;
  if (n[1] < G - 1.5) return perp;
  const c = norm(perp);
  return Math.abs(c) <= 45 ? 0 : Math.abs(c) >= 135 ? 180 : perp;
}

/** Talon et pointe (centres) ; la semelle est du côté +90° du pied. */
function footPts(n, f) {
  const d = [Math.cos(rad(f)), Math.sin(rad(f))], q = [-d[1], d[0]];
  return [[n[0] - d[0] * 1.3 + q[0] * 0.9, n[1] - d[1] * 1.3 + q[1] * 0.9], [n[0] + d[0] * 5.2 + q[0] * 0.9, n[1] + d[1] * 5.2 + q[1] * 0.9]];
}

// ───────────────────────── Résolution des poses

/** Pose de profil → articulations. Le bras / la jambe 2 (côté éloigné) suit le 1 sauf définition propre. */
function solveSide(p) {
  const hip = p.hip, t = p.t ?? -90, rel = p.ar ? t : 0;
  const ua = LEN.UA * (p.ua ?? 1), fa = LEN.FA * (p.fa ?? 1);
  const s = P(hip, t, LEN.T);
  const grip = (g) => g && [s[0] + g[0] * Math.cos(rad(t)) + g[1] * Math.cos(rad(t + 90)), s[1] + g[0] * Math.sin(rad(t)) + g[1] * Math.sin(rad(t + 90)), g[2]];
  const T1 = p.A1 || grip(p.G1), T2 = p.A2 || grip(p.G2);
  const arm2 = !!(p.a2 || T2), leg2 = !!(p.l2 || p.L2);
  const [e1, w1] = limb(s, p.a1, T1, ua, fa, 1, rel);
  const [e2, w2] = arm2 ? limb(s, p.a2, T2, ua, fa, 1, rel) : [e1, w1];
  const [k1, n1] = limb(hip, p.l1, p.L1, LEN.TH, LEN.SH, -1);
  const [k2, n2] = leg2 ? limb(hip, p.l2, p.L2, LEN.TH, LEN.SH, -1) : [k1, n1];
  const fo1 = p.f1 ?? footAngle(k1, n1);
  const fo2 = leg2 ? p.f2 ?? footAngle(k2, n2) : fo1;
  return { side: true, hip, s, t, bow: p.bow || 0, hd: P(s, t + (p.h || 0), LEN.HD), e1, w1, e2, w2, k1, n1, k2, n2, f1: fo1, f2: fo2, arm2, leg2 };
}

const mir = (a) => a && [180 - a[0], 180 - a[1]];
/** Pose de face (ou de dos) : membres du côté droit de l'écran, miroir pour l'autre côté sauf a2/l2 explicites. */
function frontDefs(p) {
  const mirT = (q) => q && [2 * p.c[0] - q[0], q[1], -(q[2] ?? 1)];
  return {
    arm1: p.A ? { T: p.A } : { a: p.a },
    arm2: p.A2 ? { T: p.A2 } : p.a2 ? { a: p.a2 } : p.A ? { T: mirT(p.A) } : { a: mir(p.a) },
    leg1: p.L ? { T: p.L } : { a: p.l },
    leg2: p.L2 ? { T: p.L2 } : p.l2 ? { a: p.l2 } : p.L ? { T: mirT(p.L) } : { a: mir(p.l) },
  };
}

function solveFront(p) {
  const c = p.c, t = p.t ?? -90, tl = p.tl ?? 1;
  const ua = LEN.UA * (p.ua ?? 1), fa = LEN.FA * (p.fa ?? 1);
  const neck = P(c, t, LEN.T * tl);
  const d = frontDefs(p);
  const s1 = P(neck, t + 90, LEN.SW), s2 = P(neck, t - 90, LEN.SW);
  const h1 = P(c, t + 90, LEN.HW), h2 = P(c, t - 90, LEN.HW);
  // `sa` : bras tendus vers nous (écartés) — vus en projection, leur longueur suit la distance à la main
  const arm = (s, def, bend) => (p.sa && def.T ? [[(s[0] + def.T[0]) / 2, (s[1] + def.T[1]) / 2], [def.T[0], def.T[1]]] : limb(s, def.a, def.T, ua, fa, bend));
  const [e1, w1] = arm(s1, d.arm1, 1);
  const [e2, w2] = arm(s2, d.arm2, -1);
  const [k1, n1] = limb(h1, d.leg1.a, d.leg1.T, LEN.TH, LEN.SH, 1);
  const [k2, n2] = limb(h2, d.leg2.a, d.leg2.T, LEN.TH, LEN.SH, -1);
  return { front: true, c, t, tl, neck, hd: P(neck, t + (p.h || 0), LEN.HD * (p.hl ?? 1)), s1, s2, h1, h2, e1, w1, e2, w2, k1, n1, k2, n2 };
}

/** Rotation de toute la figure (vue de dessus, planche latérale). */
function rotate(J, rot) {
  if (!rot || !rot[0]) return J;
  const [deg, cx, cy] = rot, c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  const R = {};
  for (const [k, v] of Object.entries(J)) {
    R[k] = Array.isArray(v) && v.length === 2 && typeof v[0] === "number"
      ? [cx + (v[0] - cx) * c - (v[1] - cy) * s, cy + (v[0] - cx) * s + (v[1] - cy) * c] : v;
  }
  R.t = J.t + deg;
  if (J.side) { R.f1 = J.f1 + deg; R.f2 = J.f2 + deg; }
  return R;
}

function solve(spec, pose) {
  return rotate(spec.view ? solveFront(pose) : solveSide(pose), pose.rot);
}

// ───────────────────────── Interpolation membre par membre

const SIDE_KEYS = { arm1: ["a1", "A1", "G1"], arm2: ["a2", "A2", "G2"], leg1: ["l1", "L1"], leg2: ["l2", "L2"] };
const FRONT_KEYS = { arm1: ["a", "A"], arm2: ["a2", "A2"], leg1: ["l", "L"], leg2: ["l2", "L2"] };

function sideDefs(p) {
  return {
    arm1: p.A1 ? { T: p.A1 } : p.G1 ? { G: p.G1 } : { a: p.a1 },
    arm2: p.A2 ? { T: p.A2 } : p.G2 ? { G: p.G2 } : p.a2 ? { a: p.a2 } : null, // null : suit le bras 1
    leg1: p.L1 ? { T: p.L1 } : { a: p.l1 },
    leg2: p.L2 ? { T: p.L2 } : p.l2 ? { a: p.l2 } : null,
  };
}

function anglesOf(J, limbName) {
  const root = { arm1: J.side ? J.s : J.s1, arm2: J.side ? J.s : J.s2, leg1: J.side ? J.hip : J.h1, leg2: J.side ? J.hip : J.h2 }[limbName];
  const [m, e] = { arm1: [J.e1, J.w1], arm2: [J.e2, J.w2], leg1: [J.k1, J.n1], leg2: [J.k2, J.n2] }[limbName];
  return [ang(root, m), ang(m, e)];
}

/** Poses a et b résolues sans rotation, gardées en cache sur la spec. */
function ends(spec) {
  if (!spec._ends) {
    const un = (p) => (spec.view ? solveFront(p) : solveSide(p));
    spec._ends = [un(spec.a), un(spec.b)];
  }
  return spec._ends;
}

function blend(spec, k) {
  const A = spec.a, B = spec.b, [JA, JB] = ends(spec);
  const front = !!spec.view;
  const o = front
    ? { c: lerpV(A.c, B.c, k), t: angLerp(A.t ?? -90, B.t ?? -90, k), tl: lerpN(A.tl ?? 1, B.tl ?? 1, k), hl: lerpN(A.hl ?? 1, B.hl ?? 1, k) }
    : { hip: lerpV(A.hip, B.hip, k), t: angLerp(A.t ?? -90, B.t ?? -90, k), bow: lerpN(A.bow || 0, B.bow || 0, k) };
  o.h = lerpN(A.h || 0, B.h || 0, k);
  if (A.sa || B.sa) o.sa = 1;
  o.ua = lerpN(A.ua ?? 1, B.ua ?? 1, k);
  o.fa = lerpN(A.fa ?? 1, B.fa ?? 1, k);
  if (A.rot || B.rot) {
    const ra = A.rot || [0, ...(B.rot || []).slice(1)], rb = B.rot || [0, ...ra.slice(1)];
    o.rot = [lerpN(ra[0], rb[0], k), ra[1], ra[2]];
  }
  const da = front ? frontDefs(A) : sideDefs(A), db = front ? frontDefs(B) : sideDefs(B);
  const keys = front ? FRONT_KEYS : SIDE_KEYS;
  for (const name of Object.keys(keys)) {
    const x = da[name], y = db[name], [ka, kT, kG] = keys[name];
    if (!x && !y) continue;
    // Sens du coude / genou : celui de la pose fléchie (b), gardé tout le long pour ne jamais basculer
    if (x?.T && y?.T) o[kT] = [...lerpV(x.T, y.T, k), y.T[2] ?? x.T[2]];
    else if (x?.G && y?.G) o[kG] = [...lerpV(x.G, y.G, k), y.G[2] ?? x.G[2]];
    else {
      const u = anglesOf(JA, name), v = anglesOf(JB, name), dir = spec.dir?.[name] || 0;
      o[ka] = [angLerp(u[0], v[0], k, dir), angLerp(u[1], v[1], k, dir)];
    }
  }
  if (!front) {
    o.f1 = angLerp(JA.f1, JB.f1, k);
    if (JA.leg2 || JB.leg2) o.f2 = angLerp(JA.f2, JB.f2, k);
  }
  return o;
}

// ───────────────────────── Tempo

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = ((ax * t + bx) * t + cx) * t - x, s = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-5 || !s) break;
      t = Math.min(1, Math.max(0, t - d / s));
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
// Poussée : démarre vite et freine au verrouillage. Retour : contrôlé, symétrique.
const EASE = { work: bezier(0.3, 0, 0.18, 1), back: bezier(0.42, 0, 0.58, 1), flow: bezier(0.37, 0, 0.63, 1) };

function cycleOf(spec) {
  return spec.gen ? spec.period : spec.tempo.reduce((t, d) => t + d, 0);
}

/** Position dans le cycle : segment (0 a→b, 1 pause en b, 2 b→a, 3 pause en a), avancement, pose. */
function at(spec, sec) {
  const total = cycleOf(spec);
  const x = ((sec % total) + total) % total;
  if (spec.gen) return { seg: 0, u: x / total, pose: spec.gen(x / total) };
  let rest = x, seg = 0;
  while (seg < 3 && rest >= spec.tempo[seg]) rest -= spec.tempo[seg++];
  const u = spec.tempo[seg] ? Math.min(1, rest / spec.tempo[seg]) : 1;
  const ease = (leg) => (spec.work == null ? EASE.flow : spec.work === leg ? EASE.work : EASE.back);
  const k = seg === 0 ? ease(0)(u) : seg === 1 ? 1 : seg === 2 ? 1 - ease(1)(u) : 0;
  return { seg, u, pose: blend(spec, k) };
}

// ───────────────────────── Tracé

const C = (q, r, cls) => ({ t: "circle", a: { cx: f2(q[0]), cy: f2(q[1]), r, class: cls } });
const L = (p, q, cls, w) => ({ t: "line", a: { x1: f2(p[0]), y1: f2(p[1]), x2: f2(q[0]), y2: f2(q[1]), class: cls, "stroke-width": w } });
const E = (c, rx, ry, rot, cls) => ({ t: "ellipse", a: { cx: f2(c[0]), cy: f2(c[1]), rx, ry, transform: `rotate(${f2(rot)} ${f2(c[0])} ${f2(c[1])})`, class: cls } });

/** Membre « en volume » : contour d'un tube le long d'une ligne, rayon variable, bouts arrondis. */
function tubeD(pts, rs) {
  const n = pts.length, l = [], r = [];
  for (let i = 0; i < n; i++) {
    const a = ang(pts[Math.max(0, i - 1)], pts[Math.min(n - 1, i + 1)]);
    l.push(P(pts[i], a - 90, rs[i]));
    r.push(P(pts[i], a + 90, rs[i]));
  }
  const side = (ps) => {
    let d = "";
    for (let i = 1; i < ps.length - 1; i++) d += `Q${pt(ps[i])} ${pt([(ps[i][0] + ps[i + 1][0]) / 2, (ps[i][1] + ps[i + 1][1]) / 2])}`;
    return d + `L${pt(ps[ps.length - 1])}`;
  };
  const re = r.slice().reverse();
  return `M${pt(l[0])}${side(l)}A${f2(rs[n - 1])} ${f2(rs[n - 1])} 0 0 1 ${pt(re[0])}${side(re)}A${f2(rs[0])} ${f2(rs[0])} 0 0 1 ${pt(l[0])}Z`;
}
const tube = (pts, rs, cls) => ({ t: "path", a: { d: tubeD(pts, rs), class: cls } });

// Muscles vus de profil : [segment, position le long du segment, côté (1 avant, -1 arrière), décalage, rx, ry, volume]
// « volume » : dessiné même hors surbrillance, pour donner sa silhouette au personnage.
const SIDE_M = {
  glutes: ["to", -0.04, -1, 3.1, 4.4, 4.1, 1], lowerback: ["to", 0.2, -1, 3.5, 4.4, 1.9],
  lats: ["to", 0.58, -1, 3.1, 6.4, 2.5, 1], upperback: ["to", 0.84, -1, 3.3, 3.8, 2.4],
  traps: ["to", 0.99, -1, 2.6, 3.4, 2.2], abs: ["to", 0.34, 1, 3.4, 5.8, 2],
  obliques: ["to", 0.42, 0, 0.6, 5.4, 3.2], chest: ["to", 0.76, 1, 3.3, 4.6, 2.7, 1],
  quads: ["th", 0.48, 1, 1.5, 7.6, 2.4, 1], hamstrings: ["th", 0.52, -1, 1.4, 7, 2.2, 1],
  adductors: ["th", 0.3, 0, 0, 5.4, 2.2], calves: ["sh", 0.28, -1, 1.25, 5, 2.1, 1],
  delts: ["ua", 0.1, 1, 0.5, 3.8, 3.3, 1], rear: ["ua", 0.1, -1, 0.6, 3.8, 3.3],
  biceps: ["ua", 0.55, 1, 1.1, 4.6, 1.85, 1], triceps: ["ua", 0.5, -1, 1.1, 5.2, 1.9, 1],
  forearms: ["fa", 0.3, 1, 0.4, 4.4, 1.7, 1],
};
const SIDE_ORDER = { to: ["glutes", "lowerback", "lats", "upperback", "traps", "abs", "obliques", "chest"], th: ["quads", "hamstrings", "adductors"], sh: ["calves"], ua: ["biceps", "triceps"], fa: ["forearms"] };

/** Ventre musculaire le long de p→q ; `nrm` : angle de la normale « avant ». */
function bellyOn(p, q, m, nrm, cls) {
  const [, f, side, off, rx, ry] = SIDE_M[m];
  const th = ang(p, q), c = P(lerpV(p, q, f), side ? nrm + (side < 0 ? 180 : 0) : nrm, side ? off : 0);
  return E(c, rx, ry, th, cls);
}

function bellies(out, seg, p, q, nrm, paint, far) {
  for (const m of SIDE_ORDER[seg]) {
    const hit = paint.m(m, far);
    if (hit) out.push(bellyOn(p, q, m, nrm, hit));
    else if (SIDE_M[m][6]) out.push(bellyOn(p, q, m, nrm, far ? paint.f : paint.n));
  }
}

function bodySide(J, paint) {
  const out = [];
  const leg = (k, n, f, far) => {
    const cls = far ? paint.f : paint.n;
    out.push(tube([J.hip, k], [3.5, 2.6], cls));
    bellies(out, "th", J.hip, k, ang(J.hip, k) - 90, paint, far);
    out.push(tube([k, n], [2.6, 1.8], cls));
    bellies(out, "sh", k, n, ang(k, n) - 90, paint, far);
    out.push(tube(footPts(n, f), [1.9, 1.35], cls));
  };
  const arm = (e, w, far) => {
    const cls = far ? paint.f : paint.n;
    if (!far) {
      const delt = paint.m("delts") || paint.m("rear");
      out.push(bellyOn(J.s, e, paint.m("rear") && !paint.m("delts") ? "rear" : "delts", ang(J.s, e) - 90, delt || cls));
    }
    out.push(tube([J.s, e], [2.7, 2.2], cls));
    bellies(out, "ua", J.s, e, ang(J.s, e) - 90, paint, far);
    out.push(tube([e, w], [2.2, 1.7], cls));
    bellies(out, "fa", e, w, ang(e, w) - 90, paint, far);
    out.push(C(w, 2.2, cls));
  };
  if (J.leg2) leg(J.k2, J.n2, J.f2, true);
  if (J.arm2) arm(J.e2, J.w2, true);
  // Buste : courbe hanche → épaule (dos rond ou creusé avec `bow`)
  const th = ang(J.hip, J.s), m = [(J.hip[0] + J.s[0]) / 2, (J.hip[1] + J.s[1]) / 2];
  const ctrl = P(m, th - 90, J.bow);
  const bz = (u) => [0, 1].map((i) => (1 - u) ** 2 * J.hip[i] + 2 * u * (1 - u) * ctrl[i] + u * u * J.s[i]);
  out.push(tube([0, 0.25, 0.5, 0.75, 1].map(bz), [4.9, 4.8, 5.1, 5.5, 5], paint.n));
  for (const mus of SIDE_ORDER.to) {
    const hit = paint.m(mus);
    if (!hit && !SIDE_M[mus][6]) continue;
    const f = SIDE_M[mus][1], u = Math.max(0, Math.min(1, f));
    const p = bz(Math.max(0, u - 0.05)), q = bz(Math.min(1, u + 0.05));
    const c = lerpV(J.hip, J.s, f < 0 ? f : 0);
    const base = f < 0 ? c : bz(u);
    const [, , side, off, rx, ry] = SIDE_M[mus];
    const dirA = ang(p, q), nrm = dirA + 90;
    const cc = side ? P(base, side > 0 ? nrm : nrm + 180, off) : P(base, nrm, off);
    out.push(E(cc, rx, ry, dirA, hit || paint.n));
  }
  // Cou et tête
  const hdir = ang(J.s, J.hd);
  out.push(tube([J.s, P(J.s, hdir, 4.4)], [2.5, 2.3], paint.n), C(J.hd, LEN.HR, paint.n));
  leg(J.k1, J.n1, J.f1, false);
  arm(J.e1, J.w1, false);
  return out;
}

// Muscles vus de face / de dos, dans le repère du buste : [hauteur (0 bassin → 1 cou), écart latéral, rx, ry, inclinaison, symétrique]
const FRONT_TORSO = { chest: [0.8, 3.1, 3.3, 2.6, 0, 1], abs: [0.42, 0, 2.5, 5.4, 0, 0], obliques: [0.45, 4.1, 1.3, 3.8, 8, 1], traps: [0.99, 3.6, 2.8, 1.1, 20, 1] };
const BACK_TORSO = { traps: [0.88, 0, 4.4, 3.6, 0, 0], upperback: [0.7, 2.6, 2.2, 2.8, 0, 1], lats: [0.55, 4.2, 2.3, 5.4, 14, 1], lowerback: [0.2, 1.3, 1.2, 3.2, 0, 1] };
// Membres : [segment, position, rx, ry, décalage vers l'intérieur]
const FRONT_LIMB = { delts: ["ua", 0.08, 3.7, 3.3, 0], biceps: ["ua", 0.55, 4.6, 1.9, 0], forearms: ["fa", 0.3, 4.2, 1.6, 0], quads: ["th", 0.48, 7.4, 2.8, 0], adductors: ["th", 0.32, 5, 1.3, 1.5], calves: ["sh", 0.3, 4.4, 1.4, -1] };
const BACK_LIMB = { rear: ["ua", 0.08, 3.7, 3.3, 0], triceps: ["ua", 0.5, 5, 2, 0], forearms: ["fa", 0.3, 4.2, 1.6, 0], hamstrings: ["th", 0.5, 7.2, 2.7, 0], calves: ["sh", 0.3, 5, 2.2, 0] };
const VOLUME_FB = new Set(["delts", "rear", "quads", "hamstrings", "calves", "biceps", "triceps"]);

function bodyFront(J, paint, back) {
  const out = [], n = paint.n;
  const X = (u, x) => P(P(J.c, J.t, u * LEN.T * J.tl), J.t + 90, x);
  const limbM = back ? BACK_LIMB : FRONT_LIMB;
  const muscle = (seg, p, q, list) => {
    for (const [m, [s, f, rx, ry, inner]] of Object.entries(limbM)) {
      if (s !== seg || !list.includes(m)) continue;
      const hit = paint.m(m);
      if (!hit && !(VOLUME_FB.has(m) && paint.vol)) continue;
      let c = lerpV(p, q, f);
      if (inner) {
        const th = ang(p, q), a = th + 90, toward = (J.c[0] - c[0]) * Math.cos(rad(a)) + (J.c[1] - c[1]) * Math.sin(rad(a)) > 0 ? a : a + 180;
        c = P(c, toward, inner);
      }
      out.push(E(c, rx, ry, ang(p, q), hit || n));
    }
  };
  const legs = (h, k, nn, sgn) => {
    out.push(tube([h, k], [3.5, 2.6], n), tube([k, nn], [2.5, 1.8], n));
    out.push(tube([P(nn, J.t + 180, 0.9), P(P(nn, J.t + 180, 1.4), J.t + 90, sgn * 2.4)], [1.9, 1.5], n));
    muscle("th", h, k, Object.keys(limbM));
    muscle("sh", k, nn, Object.keys(limbM));
  };
  const arms = (s, e, w) => {
    muscle("ua", s, e, back ? ["rear"] : ["delts"]);
    out.push(tube([s, e], [2.7, 2.2], n));
    muscle("ua", s, e, back ? ["triceps"] : ["biceps"]);
    out.push(tube([e, w], [2.2, 1.7], n));
    muscle("fa", e, w, ["forearms"]);
    out.push(C(w, 2.2, n));
  };
  const head = () => out.push(tube([J.neck, P(J.neck, ang(J.neck, J.hd), 4.2 * (J.tl < 1 ? 0.6 : 1))], [2.4, 2.3], n), C(J.hd, LEN.HR, n));
  legs(J.h1, J.k1, J.n1, 1);
  legs(J.h2, J.k2, J.n2, -1);
  if (back) head();
  // Buste : épaules larges, taille marquée, bassin
  const right = [[-0.08, 4.9], [0.15, 5.2], [0.45, 4.6], [0.72, 5.8], [0.9, 6.9], [1, 7.3]].map(([u, x]) => X(u, x));
  const left = [[1, -7.3], [0.9, -6.9], [0.72, -5.8], [0.45, -4.6], [0.15, -5.2], [-0.08, -4.9]].map(([u, x]) => X(u, x));
  const ring = [...right, ...left];
  let d = `M${pt([(ring[0][0] + ring[ring.length - 1][0]) / 2, (ring[0][1] + ring[ring.length - 1][1]) / 2])}`;
  for (let i = 0; i < ring.length; i++) {
    const nx = ring[(i + 1) % ring.length];
    d += `Q${pt(ring[i])} ${pt([(ring[i][0] + nx[0]) / 2, (ring[i][1] + nx[1]) / 2])}`;
  }
  out.push({ t: "path", a: { d: d + "Z", class: n } });
  if (back) for (const sgnX of [1, -1]) out.push(E(X(-0.1, 2.6 * sgnX), 3.3, 3.4, J.t + 90, paint.m("glutes") || n));
  const torso = back ? BACK_TORSO : FRONT_TORSO;
  for (const [m, [u, x, rx, ry, tilt, sym]] of Object.entries(torso)) {
    const hit = paint.m(m);
    if (!hit) continue;
    for (const s of sym ? [1, -1] : [1]) out.push(E(X(u, x * s), rx, ry, J.t + 90 + tilt * s, hit));
  }
  if (!back) head();
  arms(J.s1, J.e1, J.w1);
  arms(J.s2, J.e2, J.w2);
  return out;
}

const KIT_FRONT = new Set(["bar", "db", "dbs", "grip", "pad", "plate"]);

function kit(spec, J, pose, layer, out) {
  for (const pr of spec.props || []) {
    if ((layer === "front") !== KIT_FRONT.has(pr.k)) continue;
    const at0 = typeof pr.at === "string" ? J[pr.at] : pr.at;
    let q = at0 && [at0[0] + (pr.dx || 0), at0[1] + (pr.dy || 0)];
    if (q && pr.nrm) q = P(q, ang(J[pr.nrm[0]], J[pr.nrm[1]]) + pr.nrm[2], pr.nrm[3]);
    switch (pr.k) {
      case "bar": out.push(C(q, pr.r || 7, "kit-ring"), C(q, 1.8, "kit-fill")); break;
      case "db": out.push(C(q, pr.r || 3.8, "kit-fill"), C(q, 1.2, "kit-hub")); break;
      case "dbs": { // haltère vu de côté (prise neutre), perpendiculaire à l'avant-bras
        const a = ang(J.e1, J.w1) + 90;
        out.push(L(P(q, a, 3.4), P(q, a + 180, 3.4), "kit", 1.5), L(P(q, a, 2.9), P(q, a, 4.3), "kit", 4.6), L(P(q, a + 180, 2.9), P(q, a + 180, 4.3), "kit", 4.6));
        break;
      }
      case "grip": out.push(C(q, 2.4, "kit-fill")); break;
      case "pad": out.push(C(q, pr.r || 3.4, "kit-fill")); break;
      case "plate": out.push(L(P(q, pr.ang, pr.len / 2), P(q, pr.ang + 180, pr.len / 2), "kit", 4)); break;
      case "bench": {
        const [[x1, y1], [x2, y2]] = pr.p;
        for (const x of pr.legs || []) out.push(L([x, y1 + ((y2 - y1) * (x - x1)) / (x2 - x1 || 1)], [x, FLOOR], "kit-thin", 2.4));
        out.push(L([x1, y1], [x2, y2], "kit", 5));
        break;
      }
      case "line": out.push({ t: "polyline", a: { points: pr.p.map(pt).join(" "), class: pr.thin ? "kit-thin" : "kit", "stroke-width": pr.w || 2.6 } }); break;
      case "box": out.push({ t: "rect", a: { x: pr.r[0], y: pr.r[1], width: pr.r[2], height: f2(FLOOR - pr.r[1]), rx: 1.5, class: "kit-box" } }); break;
      case "rect": out.push({ t: "rect", a: { x: pr.r[0], y: pr.r[1], width: pr.r[2], height: pr.r[3], rx: 3, class: "kit-box" } }); break;
      case "pbar": out.push(L([pr.at[0] - (pr.w || 15), pr.at[1]], [pr.at[0] + (pr.w || 15), pr.at[1]], "kit", 3)); break;
      case "ring": out.push({ t: "circle", a: { cx: pr.c[0], cy: pr.c[1], r: pr.r, class: "kit-ring", "stroke-width": pr.w || 2 } }); break;
      case "cable": out.push(L(J[pr.from], pr.to, "kit-thin", 1.1), C(pr.to, 2.4, "kit-fill")); break;
      case "crank": out.push(L(pose.P1, pose.P2, "kit", 2.2), C(lerpV(pose.P1, pose.P2, 0.5), 2.4, "kit-fill"), C(pose.P1, 1.5, "kit-fill"), C(pose.P2, 1.5, "kit-fill")); break;
    }
  }
}

/** Ombre au sol sous les appuis : plus petite et plus pâle quand le corps décolle. */
function shadow(J, out) {
  const pts = [J.n1, J.n2, J.k1, J.k2, J.hip || J.c, J.w1, J.w2, J.hd, J.s || J.neck].filter(Boolean);
  const low = Math.max(...pts.map((p) => p[1]));
  const near = pts.filter((p) => p[1] > low - 12);
  const xs = near.map((p) => p[0]);
  const lift = Math.max(0, G - low);
  const o = Math.max(0.25, 1 - lift / 22);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, rx = ((Math.max(...xs) - Math.min(...xs)) / 2 + 5) * (0.55 + 0.45 * o);
  out.push({ t: "ellipse", a: { cx: f2(cx), cy: FLOOR, rx: f2(rx), ry: 1.9, class: "shadow", opacity: f2(0.55 * o) } });
}

function draw(spec, pose, paint, { props = true } = {}) {
  const J = solve(spec, pose);
  const out = [];
  if (props && !spec.noFloor) shadow(J, out);
  if (props) kit(spec, J, pose, "back", out);
  out.push(...(spec.view ? bodyFront(J, paint, spec.view === "back") : bodySide(J, paint)));
  if (props) kit(spec, J, pose, "front", out);
  return out;
}

const attrs = (a) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ");
const toSvg = (list) => list.map((p) => `<${p.t} ${attrs(p.a)}/>`).join("");

/** Met à jour les éléments existants au lieu de tout réécrire à chaque image. */
function patch(g, list) {
  const kids = g.children;
  if (kids.length !== list.length) return void (g.innerHTML = toSvg(list));
  for (let i = 0; i < list.length; i++) {
    const el = kids[i], p = list[i];
    if (el.tagName !== p.t) return void (g.innerHTML = toSvg(list));
    for (const k in p.a) {
      const v = String(p.a[k]);
      if (el.getAttribute(k) !== v) el.setAttribute(k, v);
    }
  }
}

// ───────────────────────── Poses

const STAND = { hip: [50, 52], t: -90, a1: [90, 90], L1: [51, G] };
const S = (o) => ({ ...STAND, ...o });
const LIE = { hip: [56, 71], t: 180, L1: [70, G] };            // allongé sur un banc plat
const FLAT_BENCH = { k: "bench", p: [[12, 78.5], [68, 78.5]], legs: [18, 60] };
const HAND = 90.2;                                              // poing posé au sol
const squatA = { hip: [50, 52], t: -86, L1: [52, G] };
const squatB = { hip: [38, 69], t: -50, L1: [52, G] };
// Pompes : chevilles fixes, corps gainé (hanche toujours à ~37,5 de la cheville, dans l'axe du buste)
const pushTop = { hip: [45, 73.2], t: -21, A1: [66, HAND], L1: [10, 85.6], h: 10 };
const pushBot = { hip: [47, 79.8], t: -9, A1: [64, HAND, 1], L1: [10, 85.6], h: 10 };
const QUAD = { hip: [42, 71], t: -21.5, h: -8, a1: [90, 90], l1: [90, 180], f1: 180 }; // à quatre pattes
const BAR = 8;                                                   // barre de traction
const hang = { hip: [50, 57.5], t: -90, A1: [51, BAR, 1], l1: [96, 140] };

// Rythmes : [aller a→b, pause en b, retour b→a, pause en a] en secondes, consignes affichées,
// `work` : trajet où le muscle travaille (0 aller, 1 retour, null : mobilité).
const K = {
  down: { tempo: [2, 0.3, 1, 0.8], say: ["Descends", null, "Pousse", null], work: 1 },
  up: { tempo: [1, 0.5, 1.8, 0.5], say: ["Pousse", null, "Redescends", null], work: 0 },
  lift: { tempo: [1, 0.4, 2, 0.4], say: ["Monte", null, "Descends lentement", null], work: 0 },
  pull: { tempo: [1, 0.6, 1.8, 0.4], say: ["Tire", "Serre", "Contrôle", null], work: 0 },
  hinge: { tempo: [2, 0.4, 1, 0.8], say: ["Hanches en arrière", null, "Remonte", null], work: 1 },
  hold: { tempo: [3, 0, 3, 0], say: ["Tiens · inspire", null, "Tiens · expire", null], work: null, hold: true },
};

/** Marche sur place : le pied d'appui glisse vers l'arrière, l'autre se lève et revient devant. */
function gait({ stride, lift, swing, lean = -88 }) {
  return (u) => {
    const th = 2 * Math.PI * u, sn = Math.sin(th), cs = Math.cos(th);
    const up1 = lift * Math.max(0, -cs), up2 = lift * Math.max(0, cs);
    return {
      hip: [50, 52 + 0.6 * sn * sn], t: lean,
      a1: [90 - swing * sn, 90 - swing * sn - 14 * Math.max(0, sn) * (swing > 8 ? 1 : 0)],
      a2: [90 + swing * sn, 90 + swing * sn - 14 * Math.max(0, -sn) * (swing > 8 ? 1 : 0)],
      L1: [51 - stride * sn, G - up1], L2: [51 + stride * sn, G - up2], f1: (22 * up1) / lift, f2: (22 * up2) / lift,
    };
  };
}

const F = {
  // ── Jambes : squat (barre dans le dos : bras raccourcis, ils partent sur le côté)
  back_squat: { ...K.down, a: { ...squatA, ar: 1, a1: [211, 11], ua: 0.55, fa: 0.45 }, b: { ...squatB, ar: 1, a1: [211, 11], ua: 0.55, fa: 0.45 }, props: [{ k: "bar", at: "w1", r: 6.5 }] },
  front_squat: { ...K.down, a: { ...squatA, a1: [4, 159], fa: 0.62 }, b: { hip: [42, 72], t: -66, L1: [52, G], a1: [0, 155], fa: 0.62 }, props: [{ k: "bar", at: "w1", r: 6.5 }] },
  goblet_squat: { ...K.down, a: { ...squatA, ar: 1, a1: [146, -14], fa: 0.7 }, b: { hip: [41, 72], t: -62, L1: [52, G], ar: 1, a1: [146, -14], fa: 0.7 }, props: [{ k: "db", at: "w1", r: 4.4 }] },
  bw_squat: { tempo: [3, 0.3, 0.8, 0.8], say: ["Descends · 3 s", null, "Remonte vite", null], work: 1, a: { ...squatA, a1: [0, 0] }, b: { ...squatB, a1: [0, 0] } },
  jump_squat: {
    tempo: [0.45, 0.2, 0.55, 0.7], say: ["Saute", null, "Amortis", null], work: 0, dir: { arm1: -1 },
    a: { hip: [42, 66], t: -58, L1: [52, G], a1: [150, 150] }, b: { hip: [50, 45], t: -88, L1: [51, 83], f1: 60, a1: [-72, -72] },
  },
  leg_press: {
    ...K.up, say: ["Pousse", null, "Ramène lentement", null], key: "a",
    a: { hip: [36, 70], t: -128, L1: [58, 54], a1: [60, 40], f1: -128 }, b: { hip: [36, 70], t: -128, L1: [67, 46], a1: [60, 40], f1: -128 },
    props: [{ k: "line", p: [[50, 66], [88, 36]], thin: 1, w: 2 }, { k: "bench", p: [[24, 76], [44, 74]], legs: [28, 40] }, { k: "line", p: [[36, 75], [15, 50]], w: 5 }, { k: "plate", at: "n1", ang: 52, len: 22, dx: 3, dy: -2 }],
  },
  // ── Charnière de hanche : barre près des jambes, au-dessus du milieu du pied
  rdl: { ...K.hinge, a: S({ L1: [52, G], A1: [52.5, 56] }), b: { hip: [37, 56], t: -22, L1: [52, G], A1: [55, 75.5] }, props: [{ k: "bar", at: "w1", r: 6.5 }] },
  db_rdl: { ...K.hinge, a: S({ L1: [52, G], A1: [52.5, 56] }), b: { hip: [37, 56], t: -22, L1: [52, G], A1: [55, 75.5] }, props: [{ k: "db", at: "w1" }] },
  deadlift: {
    tempo: [1.2, 0.7, 1.6, 0.5], say: ["Pousse le sol", "Verrouille", "Redescends", null], work: 0, key: "a",
    a: { hip: [40, 70], t: -28, L1: [52, G], A1: [55, FLOOR - 6.5] }, b: S({ L1: [52, G], A1: [52.5, 56] }), props: [{ k: "bar", at: "w1", r: 6.5 }],
  },
  hip_thrust: {
    tempo: [1, 1, 1.6, 0.4], say: ["Monte", "Serre", "Descends", null], work: 0,
    a: { hip: [42, 82], t: 209, h: 20, A1: [44, 76], L1: [66, G] }, b: { hip: [48, 71], t: 180, h: 20, A1: [48, 66], L1: [66, G] },
    props: [{ k: "bench", p: [[4, 79], [26, 79]], legs: [8, 22] }, { k: "bar", at: "hip", dy: -7, r: 6.5 }],
  },
  glute_bridge: {
    tempo: [1, 2, 1.4, 0.4], say: ["Monte", "Pause 2 s", "Descends", null], work: 0,
    a: { hip: [42, 85], t: 180, h: 0, a1: [8, 4], L1: [64, 89] }, b: { hip: [46, 76], t: 157, h: 23, a1: [10, 4], L1: [64, 89] },
  },
  // ── Fentes
  bulgarian: {
    ...K.down, a: { hip: [48, 54], t: -85, a1: [90, 90], L1: [60, G], L2: [24, 71], f2: 180 }, b: { hip: [44, 68], t: -75, a1: [90, 90], L1: [60, G], L2: [24, 71], f2: 180 },
    props: [{ k: "bench", p: [[10, 76.5], [32, 76.5]], legs: [14, 28] }, { k: "db", at: "w1" }],
  },
  walking_lunge: { ...K.down, say: ["Grand pas · descends", null, "Pousse", null], a: S({ L1: [60, G], L2: [42, G] }), b: { hip: [48, 70], t: -90, a1: [90, 90], L1: [64, G], L2: [30, 86], f2: 55 }, props: [{ k: "db", at: "w1" }] },
  reverse_lunge: { ...K.down, say: ["Recule · descends", null, "Pousse devant", null], a: S({ hip: [56, 52], L1: [58, G], L2: [56, G] }), b: { hip: [50, 70], t: -90, a1: [90, 90], L1: [64, G], L2: [32, 86], f2: 55 }, props: [{ k: "db", at: "w1" }] },
  step_up: {
    tempo: [1.2, 0.6, 1.8, 0.5], say: ["Monte", null, "Descends lentement", null], work: 0,
    a: { hip: [42, 56], t: -86, a1: [90, 90], L1: [62, 69], L2: [40, G] }, b: { hip: [58, 33], t: -90, a1: [90, 90], L1: [62, 69], L2: [54, 58] },
    props: [{ k: "box", r: [52, 71, 28] }, { k: "db", at: "w1" }],
  },
  // ── Isolation jambes
  leg_curl: {
    tempo: [1, 0.5, 2, 0.4], say: ["Talons aux fessiers", null, "Retour lent", null], work: 0,
    a: { hip: [46, 70], t: 0, h: -8, A1: [78, 80], l1: [180, 180], f1: 90 }, b: { hip: [46, 70], t: 0, h: -8, A1: [78, 80], l1: [180, -60] },
    props: [{ k: "bench", p: [[8, 78.5], [74, 78.5]], legs: [14, 66] }, { k: "pad", at: "n1", nrm: ["k1", "n1", 90, 3.2] }],
  },
  single_leg_rdl: {
    ...K.hinge, say: ["Penche-toi", null, "Remonte", null],
    a: S({ hip: [58, 53], L1: [60, G], L2: [55, 86] }), b: { hip: [42, 58], t: -8, a1: [90, 90], L1: [60, G], l2: [172, 172], f2: 90 },
    props: [{ k: "db", at: "w1" }],
  },
  slider_curl: {
    tempo: [1.2, 0.3, 2, 0.4], say: ["Ramène les talons", null, "Retour lent", null], work: 0,
    a: { hip: [46, 80], t: 168, h: 12, a1: [8, 4], L1: [82, 88], f1: -100 }, b: { hip: [46, 74], t: 155, h: 25, a1: [10, 4], L1: [64, 88] },
  },
  leg_extension: {
    tempo: [1, 1, 1.6, 0.4], say: ["Tends", "Pause 1 s", "Retour lent", null], work: 0,
    a: { hip: [38, 61], t: -95, A1: [44, 66], l1: [0, 90] }, b: { hip: [38, 61], t: -95, A1: [44, 66], l1: [0, -5] },
    props: [{ k: "bench", p: [[28, 67.5], [54, 67.5]], legs: [34, 50] }, { k: "line", p: [[30, 66], [26, 36]], w: 5 }, { k: "pad", at: "n1", nrm: ["k1", "n1", -90, 3.2] }],
  },
  wall_sit: { ...K.hold, a: { hip: [30, 68], t: -90, A1: [46, 66], L1: [52, G] }, b: { hip: [30, 68.6], t: -91, A1: [46, 66.6], L1: [52, G] }, props: [{ k: "line", p: [[23, 14], [23, FLOOR]], w: 3 }] },
  cable_kickback: {
    tempo: [0.9, 0.5, 1.6, 0.3], say: ["Pousse le talon", null, "Contrôle", null], work: 0,
    a: { hip: [46, 52], t: -70, A1: [72, 42], L1: [48, 88], L2: [50, G] }, b: { hip: [46, 52], t: -70, A1: [72, 42], l1: [158, 168], L2: [50, G] },
    props: [{ k: "line", p: [[76, 8], [76, FLOOR]], w: 4 }, { k: "cable", from: "n1", to: [74, 84] }],
  },
  frog_pump: null, // défini plus bas, d'après le pont fessier
  standing_calf: {
    tempo: [0.8, 1, 1.6, 1], say: ["Monte", "Pause", "Descends lentement", "Étire"], work: 0,
    a: { hip: [50, 44], t: -90, a1: [60, -70], L1: [50, 82], f1: 15 }, b: { hip: [50, 41.3], t: -90, a1: [60, -70], L1: [50, 79.2], f1: 62 },
    props: [{ k: "box", r: [51, 85.4, 20] }, { k: "pad", at: "s", dy: -4, dx: 2 }],
  },
  db_calf: {
    tempo: [0.8, 1, 1.6, 1], say: ["Monte", "Pause", "Descends lentement", "Étire"], work: 0,
    a: { hip: [50, 44], t: -90, a1: [90, 90], L1: [50, 82], f1: 15 }, b: { hip: [50, 41.3], t: -90, a1: [90, 90], L1: [50, 79.2], f1: 62 },
    props: [{ k: "box", r: [51, 85.4, 20] }, { k: "db", at: "w1" }],
  },
  calf_raise_bw: {
    tempo: [0.8, 1, 1.6, 1], say: ["Monte", "Pause", "Descends lentement", "Étire"], work: 0,
    a: { hip: [50, 44], t: -90, a1: [80, 80], L1: [50, 82], f1: 15 }, b: { hip: [50, 41.3], t: -90, a1: [80, 80], L1: [50, 79.2], f1: 62 },
    props: [{ k: "box", r: [51, 85.4, 20] }],
  },

  // ── Poussée
  bench_press: { ...K.down, a: { ...LIE, A1: [34, 44] }, b: { ...LIE, A1: [37, 61] }, props: [FLAT_BENCH, { k: "bar", at: "w1", r: 6.5 }] },
  db_bench: { ...K.down, a: { ...LIE, A1: [34, 44] }, b: { ...LIE, A1: [37, 61] }, props: [FLAT_BENCH, { k: "db", at: "w1" }] },
  incline_db: {
    ...K.down, a: { hip: [44, 74], t: -130, L1: [66, G], A1: [30, 28] }, b: { hip: [44, 74], t: -130, L1: [66, G], A1: [33, 48] },
    props: [{ k: "bench", p: [[38, 81], [60, 81]], legs: [44, 56] }, { k: "line", p: [[39, 79], [18, 54]], w: 5 }, { k: "db", at: "w1" }],
  },
  chest_press: {
    ...K.up, say: ["Pousse", null, "Contrôle", null],
    a: { hip: [36, 66], t: -100, L1: [56, G], A1: [46, 42] }, b: { hip: [36, 66], t: -100, L1: [56, G], A1: [59, 41] },
    props: [{ k: "bench", p: [[26, 72.5], [48, 72.5]], legs: [30, 44] }, { k: "line", p: [[27, 71], [22, 34]], w: 5 }, { k: "grip", at: "w1" }],
  },
  dips: {
    ...K.down, a: { hip: [54, 53], t: -95, A1: [52, 56], l1: [110, 170] }, b: { hip: [56, 64], t: -100, A1: [52, 56], l1: [110, 170] },
    props: [{ k: "line", p: [[38, 58.2], [68, 58.2]], w: 3 }, { k: "line", p: [[64, 58.2], [64, FLOOR]], thin: 1, w: 2.4 }],
  },
  pushup: { ...K.down, tempo: [1.6, 0.3, 0.9, 0.5], a: pushTop, b: pushBot },
  incline_pushup: {
    ...K.down, tempo: [1.6, 0.3, 0.9, 0.5],
    a: { hip: [41.9, 63.8], t: -41, A1: [62, 74], L1: [12, 86], h: 10 }, b: { hip: [44.4, 74.4], t: -26, A1: [64, 74, 1], L1: [12, 86], h: 10 },
    props: [{ k: "bench", p: [[56, 76.5], [86, 76.5]], legs: [60, 82] }],
  },
  cable_fly: {
    view: "front", tempo: [1.2, 0.6, 1.8, 0.3], say: ["Rapproche", "Serre", "Ouvre lentement", null], work: 0,
    a: { c: [50, 52], A: [84, 24], sa: 1, l: [86, 90] }, b: { c: [50, 52], A: [52, 41], sa: 1, l: [86, 90] },
    props: [{ k: "line", p: [[95, 2], [95, FLOOR]], thin: 1, w: 3 }, { k: "line", p: [[5, 2], [5, FLOOR]], thin: 1, w: 3 }, { k: "cable", from: "w1", to: [93, 6] }, { k: "cable", from: "w2", to: [7, 6] }, { k: "grip", at: "w1" }, { k: "grip", at: "w2" }],
  },
  db_fly: { // vu de dessus, allongé sur le banc
    view: "front", tempo: [1.2, 0.4, 2, 0.3], say: ["Rapproche", null, "Ouvre lentement", null], work: 0, noFloor: true,
    a: { c: [50, 50], A: [84, 27], sa: 1, l: [90, 90], rot: [90, 50, 44] }, b: { c: [50, 50], A: [52.5, 30], sa: 1, l: [90, 90], rot: [90, 50, 44] },
    props: [{ k: "rect", r: [20, 38.5, 58, 11] }, { k: "db", at: "w1" }, { k: "db", at: "w2" }],
  },

  // ── Tirage
  barbell_row: { ...K.pull, a: { hip: [36, 57], t: -25, A1: [57.7, 74.8], L1: [52, G] }, b: { hip: [36, 57], t: -25, A1: [47.4, 57.8, -1], L1: [52, G] }, props: [{ k: "bar", at: "w1", r: 6.5 }] },
  db_row: {
    ...K.pull,
    a: { hip: [32, 54], t: -5, a1: [90, 90], A2: [58, 76], L1: [44, G], l2: [90, 180], f2: 90 }, b: { hip: [32, 54], t: -5, A1: [46, 60], A2: [58, 76], L1: [44, G], l2: [90, 180], f2: 90 },
    props: [{ k: "bench", p: [[10, 78.5], [64, 78.5]], legs: [16, 58] }, { k: "db", at: "w1" }],
  },
  cable_row: {
    ...K.pull, a: { hip: [30, 78], t: -80, A1: [57, 58], L1: [62, 82] }, b: { hip: [30, 78], t: -98, A1: [38, 66], L1: [62, 82] },
    props: [{ k: "bench", p: [[12, 85.5], [48, 85.5]], legs: [18, 42] }, { k: "line", p: [[66, 70], [66, FLOOR]], w: 3 }, { k: "cable", from: "w1", to: [92, 64] }, { k: "line", p: [[94, 40], [94, FLOOR]], thin: 1, w: 3 }, { k: "grip", at: "w1" }],
  },
  inverted_row: {
    ...K.pull, a: { hip: [59.1, 79.4], t: 195.5, A1: [36, 46], L1: [95, 89], f1: -80 }, b: { hip: [62.4, 68.7], t: 212, A1: [36, 46, -1], L1: [95, 89], f1: -80 },
    props: [{ k: "pbar", at: [36, 46] }, { k: "line", p: [[22, 46], [22, FLOOR]], thin: 1, w: 2.4 }],
  },
  pullup: { // vu de dos : prise large, dorsaux en V
    view: "back", ...K.pull, say: ["Tire", null, "Descends", null], noFloor: true,
    a: { c: [50, 55.5], A: [66, BAR, 1], l: [93, 89] }, b: { c: [50, 34], A: [66, BAR, 1], l: [97, 100] },
    props: [{ k: "pbar", at: [50, BAR], w: 24 }],
  },
  chinup: { ...K.pull, say: ["Tire", null, "Descends", null], a: hang, b: { ...hang, hip: [50, 35.5], A1: [51, BAR, 1] }, props: [{ k: "pbar", at: [51, BAR] }], noFloor: true },
  lat_pulldown: {
    ...K.pull, a: { hip: [44, 70], t: -95, A1: [47, 17], L1: [62, G] }, b: { hip: [44, 70], t: -100, A1: [48, 42], L1: [62, G] },
    props: [{ k: "bench", p: [[32, 76.5], [56, 76.5]], legs: [44] }, { k: "pad", at: [60, 64] }, { k: "cable", from: "w1", to: [47, 0] }, { k: "line", p: [[38, 0], [56, 0]], w: 3 }],
  },
  db_pullover: { tempo: [1.4, 0.3, 2, 0.5], say: ["Ramène au-dessus", null, "Descends derrière", null], work: 0, a: { ...LIE, a1: [194, 194] }, b: { ...LIE, a1: [-82, -82] }, props: [FLAT_BENCH, { k: "db", at: "w1", r: 4.6 }] },

  // ── Épaules
  ohp: { ...K.up, say: ["Pousse", null, "Descends", null], a: S({ A1: [57, 26.5], h: -12 }), b: S({ A1: [51, 1], h: 0 }), props: [{ k: "bar", at: "w1", r: 6.5 }] },
  db_shoulder: {
    ...K.up, say: ["Pousse", null, "Descends", null],
    a: { hip: [42, 72], t: -90, L1: [60, G], a1: [60, -80] }, b: { hip: [42, 72], t: -90, L1: [60, G], a1: [-86, -86] },
    props: [{ k: "bench", p: [[32, 78.5], [54, 78.5]], legs: [36, 50] }, { k: "line", p: [[35, 77], [35, 40]], w: 5 }, { k: "db", at: "w1" }],
  },
  pike_pushup: { ...K.down, a: { hip: [40, 50], t: 52.4, A1: [70, HAND], L1: [26, 89] }, b: { hip: [42, 54], t: 62, A1: [70, HAND, 1], L1: [26, 89] } },
  lateral_raise: { view: "front", ...K.lift, a: { c: [50, 52], a: [82, 86], l: [88, 90] }, b: { c: [50, 52], a: [-4, 4], l: [88, 90] }, props: [{ k: "db", at: "w1" }, { k: "db", at: "w2" }] },
  face_pull: {
    ...K.pull, say: ["Tire vers le visage", "Écarte", "Contrôle", null],
    a: S({ A1: [76, 27] }), b: S({ A1: [58, 22, -1], ua: 0.45 }),
    props: [{ k: "line", p: [[95, 0], [95, FLOOR]], thin: 1, w: 3 }, { k: "cable", from: "w1", to: [93, 26] }, { k: "grip", at: "w1" }],
  },
  reverse_fly: { // vu de dos, buste penché
    view: "back", ...K.lift, say: ["Ouvre les bras", "Serre", "Descends lentement", null],
    a: { c: [50, 52], tl: 0.62, hl: 0.22, a: [88, 90], l: [88, 91] }, b: { c: [50, 52], tl: 0.62, hl: 0.22, a: [-2, 8], l: [88, 91] },
    props: [{ k: "db", at: "w1" }, { k: "db", at: "w2" }],
  },
  y_raise: { tempo: [1, 0.8, 1.4, 0.3], say: ["Monte en Y", "Tiens", "Descends", null], work: 0, a: { hip: [41, 86], t: 0, h: -6, a1: [5, 5], l1: [180, 180], f1: 90 }, b: { hip: [41, 86], t: -5, h: -12, a1: [-16, -16], l1: [180, 180], f1: 90 } },

  // ── Bras
  db_curl: { ...K.lift, say: ["Monte", "Serre", "Descente contrôlée", null], a: S({ a1: [90, 90] }), b: S({ a1: [92, -72] }), props: [{ k: "db", at: "w1" }] },
  barbell_curl: { ...K.lift, say: ["Monte", "Serre", "Descente contrôlée", null], a: S({ a1: [90, 90] }), b: S({ a1: [92, -72] }), props: [{ k: "bar", at: "w1", r: 6.5 }] },
  triceps_pushdown: {
    ...K.up, say: ["Pousse vers le bas", null, "Remonte lentement", null], tempo: [1, 0.4, 1.6, 0.3],
    a: S({ t: -85, a1: [100, -30] }), b: S({ t: -85, a1: [96, 90] }),
    props: [{ k: "line", p: [[76, 0], [76, FLOOR]], thin: 1, w: 3 }, { k: "cable", from: "w1", to: [72, 2] }, { k: "grip", at: "w1" }],
  },
  overhead_ext: { tempo: [1, 0.3, 1.8, 0.4], say: ["Tends", null, "Descends derrière", null], work: 0, a: S({ a1: [-75, 140] }), b: S({ a1: [-82, -82] }), props: [{ k: "db", at: "w1", r: 4.6 }] },
  skull_crusher: { ...K.down, say: ["Descends vers le front", null, "Tends", null], a: { ...LIE, a1: [-100, -100] }, b: { ...LIE, a1: [-100, 168] }, props: [FLAT_BENCH, { k: "bar", at: "w1", r: 6.5 }] },
  bench_dip: {
    ...K.down, a: { hip: [40, 61], t: -90, A1: [38, 63], L1: [72, 89] }, b: { hip: [41, 74], t: -90, A1: [38, 63, 1], L1: [72, 89] },
    props: [{ k: "bench", p: [[12, 66.5], [36, 66.5]], legs: [16, 32] }],
  },

  // ── Gainage
  plank: { ...K.hold, a: { hip: [41.1, 79.2], t: -17.5, a1: [90, 0], L1: [6, 86], h: 8 }, b: { hip: [41.1, 78.4], t: -18.5, a1: [90, 0], L1: [6, 86], h: 8 } },
  side_plank: { view: "front", ...K.hold, a: { c: [16, 48], a: [20, -70], a2: [-160, -160], l: [90, 90], rot: [75, 16, 86.6] }, b: { c: [16, 48], a: [20, -70], a2: [-160, -160], l: [90, 90], rot: [73, 16, 86.6] } },
  dead_bug: {
    tempo: [2, 0.5, 1.6, 0.5], say: ["Allonge bras et jambe", "Expire", "Reviens", null], work: 0,
    a: { hip: [52, 84], t: 180, a1: [-90, -90], l1: [-90, 0] }, b: { hip: [52, 84], t: 180, a1: [190, 190], a2: [-90, -90], l1: [-5, -5], l2: [-90, 0] },
  },
  hanging_knee: { tempo: [1, 0.4, 1.6, 0.5], say: ["Monte les genoux", null, "Descends sans balancer", null], work: 0, a: { ...hang, l1: [94, 86] }, b: { ...hang, l1: [-20, 90] }, props: [{ k: "pbar", at: [51, BAR] }], noFloor: true },
  crunch: { tempo: [1, 0.5, 1.4, 0.4], say: ["Enroule", "Serre", "Déroule", null], work: 0, a: { hip: [52, 84], t: 180, h: 0, a1: [0, 0], L1: [70, 89] }, b: { hip: [52, 84], t: 205, h: 25, a1: [-10, -10], L1: [70, 89] } },
  mountain_climber: {
    tempo: [0.35, 0.05, 0.35, 0.05], say: ["Genou à la poitrine", null, "Change de jambe", null], work: null,
    // hanches un peu hautes ; la cheville file en ligne droite sous le buste, le genou ne touche pas le sol
    a: { hip: [45, 70], t: -19, A1: [67.5, HAND], h: 10, L1: [48, 80], L2: [10, 85.6] }, b: { hip: [45, 70], t: -19, A1: [67.5, HAND], h: 10, L1: [10, 85.6], L2: [48, 80] },
  },
  bird_dog: {
    tempo: [1.4, 1, 1.4, 0.5], say: ["Allonge", "Tiens", "Reviens", null], work: 0,
    a: QUAD, b: { ...QUAD, a2: [-6, -6], l1: [178, 178], f1: 90, l2: [90, 180], f2: 180 },
  },
  farmer_carry: { gen: gait({ stride: 6, lift: 2.2, swing: 3 }), period: 0.9, say: ["Petits pas rapides"], work: null, props: [{ k: "db", at: "w1", r: 4.4 }] },

  // ── Récupération
  walk: { gen: gait({ stride: 9, lift: 3, swing: 22 }), period: 1.1, say: ["Allure où tu peux parler"], work: null },
  bike_easy: {
    gen: (u) => {
      const th = 2 * Math.PI * u, P1 = [50 + 6 * Math.cos(th), 76 + 6 * Math.sin(th)], P2 = [50 - 6 * Math.cos(th), 76 - 6 * Math.sin(th)];
      return { hip: [40, 50], t: -62, A1: [67, 45], L1: [P1[0] - 1, P1[1] - 1.8], L2: [P2[0] - 1, P2[1] - 1.8], f1: 14, f2: 14, P1, P2 };
    },
    period: 1, say: ["Cadence régulière"], work: null,
    props: [{ k: "ring", c: [24, 78], r: 11 }, { k: "ring", c: [80, 78], r: 11 }, { k: "line", p: [[24, 78], [50, 76], [68, 50], [80, 78]], w: 2.4 }, { k: "line", p: [[50, 76], [40, 54]], w: 2.4 }, { k: "line", p: [[68, 50], [66, 44], [71, 44]], w: 2.4 }, { k: "crank" }],
  },
  cat_cow: { tempo: [2.5, 0.8, 2.5, 0.8], say: ["Arrondis · expire", null, "Creuse · inspire", null], work: null, a: { ...QUAD, h: -35, bow: -5 }, b: { ...QUAD, h: 40, bow: 7 } },
  child_pose: { ...K.hold, tempo: [3, 0.5, 4, 0.5], say: ["Inspire", null, "Expire · relâche", null], a: { hip: [36, 82], t: 2, h: 14, bow: 3, a1: [16, 8], l1: [24, 180], f1: 180 }, b: { hip: [35, 82.6], t: 4, h: 16, bow: 4.5, a1: [16, 8], l1: [22, 180], f1: 180 } },
  t_rotation: {
    tempo: [1.6, 0.8, 1.6, 0.5], say: ["Ouvre vers le ciel", "Tiens", "Reviens", null], work: null,
    a: { hip: [44, 68], t: -40, a1: [80, 85], a2: [80, 85], L1: [64, G], L2: [16, 88], f2: 15 }, b: { hip: [44, 68], t: -40, a1: [-88, -88], a2: [80, 85], L1: [64, G], L2: [16, 88], f2: 15 },
  },
  hip_9090: { tempo: [2, 0.8, 2, 0.8], say: ["Bascule", null, "Reviens", null], work: null, a: { hip: [44, 86.5], t: -105, A1: [30, HAND], L1: [72, G], f1: 0 }, b: { hip: [44, 86.5], t: -105, A1: [30, HAND], L1: [79, G], f1: 0 } },
  hip_flexor: { tempo: [2.5, 1.5, 2, 0.5], say: ["Bascule le bassin", "Tiens", "Relâche", null], work: null, a: { hip: [46, 68], t: -90, a1: [120, 45], L1: [66, G], L2: [23, 87], f2: 180 }, b: { hip: [50, 70], t: -96, a1: [120, 45], L1: [66, G], L2: [23, 87], f2: 180 } },
  figure4: { tempo: [2, 1.5, 2, 1], say: ["Ramène la cuisse", "Respire", "Relâche", null], work: null, a: { hip: [52, 84], t: 180, a1: [0, 0], L1: [70, 89], l2: [-50, 30] }, b: { hip: [52, 84], t: 180, A1: [60, 70], L1: [62, 68], l2: [-62, 20] } },
  ham_stretch: { tempo: [2, 1.5, 2, 1], say: ["Tire doucement", "Respire", "Relâche", null], work: null, a: { hip: [52, 84], t: 180, A1: [56, 72], l1: [-70, -70], l2: [0, 0], f1: 0 }, b: { hip: [52, 84], t: 180, A1: [51, 72], l1: [-95, -95], l2: [0, 0], f1: -10 } },
  breathing: { tempo: [4, 7, 8, 0.01], say: ["Inspire", "Retiens", "Expire", null], work: null, hold: true, a: { hip: [52, 84], t: 180, a1: [12, -40], L1: [70, 89], bow: 0 }, b: { hip: [52, 84], t: 180, a1: [12, -46], L1: [70, 89], bow: -3 } },
};
F.frog_pump = { ...F.glute_bridge, tempo: [0.6, 0.5, 0.6, 0.2], say: ["Monte", "Serre", "Descends", null] };
F.hammer_curl = { ...F.db_curl, props: [{ k: "dbs", at: "w1" }] };
F.bw_lateral = { ...F.lateral_raise, props: [] };
F.diamond_pushup = { ...F.pushup, a: { ...pushTop, A1: [62, HAND] }, b: { ...pushBot, A1: [60, HAND, 1] } };
F.negative_pullup = { ...F.pullup, a: F.pullup.b, b: F.pullup.a, tempo: [4.5, 0.4, 1.2, 0.6], say: ["Descends lentement", null, "Remonte (saut)", "Tiens en haut"], work: 0 };
F.step_up_bw = F.step_up;

// ───────────────────────── API

function infoOf(id) {
  return EXERCISES[id] || MOVES[id] || null;
}

const specCache = {};
function specOf(id) {
  if (!F[id]) return null;
  if (!specCache[id]) {
    const spec = F[id], ex = EXERCISES[id];
    // Au poids du corps, pas de charge à la main (pompes lestées, fentes…)
    specCache[id] = ex && ex.equip.length === 1 && ex.equip[0] === "bw"
      ? { ...spec, props: (spec.props || []).filter((p) => !["db", "dbs", "bar"].includes(p.k)) } : spec;
  }
  return specCache[id];
}

function paintFor(id) {
  const hl = new Set(infoOf(id)?.m?.p || []);
  return { n: "p-n", f: "p-f", vol: true, m: (m, far) => (hl.has(m) ? (far ? "p-hf" : "p-h") : null) };
}
const GHOST = { n: "p-n", f: "p-n", vol: true, m: () => null };

/** Pose la plus parlante pour une image fixe (passée par `blend` pour être identique à l'animation). */
function keyPose(spec, which = spec.key || "b") {
  return spec.gen ? spec.gen(0.25) : blend(spec, which === "a" ? 0 : 1);
}

const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const ICO = { pause: `<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`, play: `<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>` };
const secs = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")} s`;

/** Étapes du cycle pour le lecteur : durée, consigne, travail musculaire. */
function steps(spec) {
  if (spec.gen) return [{ dur: spec.period, label: spec.say[0], work: false, hold: false }];
  return spec.tempo.map((dur, i) => {
    const hold = i % 2 === 1;
    // pause courte sans consigne : on garde l'affichage du mouvement précédent
    const quiet = hold && !spec.say[i] && dur < 0.5;
    const label = spec.say[i] || (hold ? "Pause" : "");
    return { dur, label, hold, quiet, work: !hold && spec.work != null && spec.work * 2 === i };
  }).filter((s) => s.dur >= 0.05);
}

function tempoText(spec) {
  return steps(spec).filter((s) => !s.quiet).map((s) => `${s.label} ${secs(s.dur)}`).join(", ");
}

/** Pointillés de la trajectoire de la main / de la charge entre départ et arrivée. */
function traceSvg(spec) {
  if (spec.gen || !(spec.props || []).some((p) => p.at === "w1" && ["bar", "db", "dbs", "grip"].includes(p.k))) return "";
  const pts = Array.from({ length: 17 }, (_, i) => solve(spec, blend(spec, i / 16)).w1);
  const len = pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  return len > 8 ? `<polyline class="trace" points="${pts.map(pt).join(" ")}"/>` : "";
}

/**
 * SVG d'un exercice. `animate` : animé par `startFigures` (pose fixe si l'appareil réduit les animations) ;
 * `player` : grand schéma avec lecture / pause, ralenti et consigne de la phase en cours ;
 * sinon pose clé, avec la pose de départ en transparence si `ghost`.
 */
export function figure(id, { animate = false, ghost = false, player = false, cls = "" } = {}) {
  const spec = specOf(id);
  if (!spec) return `<svg class="fig ${cls}" viewBox="0 -6 100 100" aria-hidden="true"></svg>`;
  const paint = paintFor(id);
  const live = (animate || player) && !reduced;
  const floor = spec.noFloor ? "" : `<line x1="2" y1="${FLOOR}" x2="98" y2="${FLOOR}" class="floor"/>`;
  let body;
  if (live) body = toSvg(draw(spec, at(spec, 0).pose, paint));
  else {
    const other = spec.gen ? null : keyPose(spec, (spec.key || "b") === "b" ? "a" : "b");
    const showGhost = other && (ghost || animate || player);
    body = (showGhost ? `<g class="ghost">${toSvg(draw(spec, other, GHOST, { props: false }))}</g>` : "") + toSvg(draw(spec, keyPose(spec), paint));
  }
  const svg = `<svg class="fig${live ? " anim" : ""} ${cls}" viewBox="0 -6 100 100" aria-hidden="true"${live || player ? ` data-fig="${id}"` : ""}>${floor}${player ? traceSvg(spec) : ""}<g class="fig-body">${body}</g></svg>`;
  if (!player) return svg;
  const st = steps(spec);
  return `<div class="player" data-player role="group" aria-label="Animation de l'exercice : ${tempoText(spec)}">
    ${svg}
    <div class="pl-line" aria-hidden="true">${st.map((s) => `<i class="${s.work ? "w" : ""}${s.hold ? " h" : ""}" style="flex-grow:${s.dur}"><b></b></i>`).join("")}</div>
    <div class="pl-bar">
      <button type="button" class="pl-btn" data-act="toggle" aria-label="${live ? "Mettre en pause" : "Lire l'animation"}">${live ? ICO.pause : ICO.play}</button>
      <div class="pl-phase" aria-hidden="true"><b data-pl="label">${st[0].label}</b><span data-pl="sec">${secs(st[0].dur)}</span></div>
      <button type="button" class="pl-speed" data-act="speed" aria-pressed="false" aria-label="Ralenti">0,5×</button>
    </div>
  </div>`;
}

export function hasFigure(id) {
  return !!F[id];
}

// ───────────────────────── Animation : une boucle pour les schémas visibles, chacun avec sa propre horloge

const clocks = new WeakMap();
const visible = new Set();
let raf = null;
const io = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      kick();
    })
  : null;

function clockOf(svg) {
  let c = clocks.get(svg);
  if (!c) {
    const id = svg.dataset.fig;
    c = { spec: specOf(id), paint: paintFor(id), e: 0, last: 0, speed: 1, paused: reduced, drawn: reduced, seg: -1, work: false, player: null };
    clocks.set(svg, c);
  }
  return c;
}

function kick() {
  if (!raf && visible.size) raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = null;
  let running = false;
  for (const svg of visible) {
    if (!svg.isConnected) { visible.delete(svg); io?.unobserve(svg); continue; }
    const c = clockOf(svg);
    if (c.paused) { c.last = 0; if (c.drawn) continue; }
    else { c.e += (c.last ? Math.min(100, now - c.last) / 1000 : 0) * c.speed; c.last = now; running = true; }
    render(svg, c);
  }
  if (running) raf = requestAnimationFrame(frame);
}

function render(svg, c) {
  const { seg, u, pose } = at(c.spec, c.e);
  patch(svg.querySelector(".fig-body"), draw(c.spec, pose, c.paint));
  c.drawn = true;
  const work = c.spec.work != null && seg === c.spec.work * 2;
  if (work !== c.work) { c.work = work; svg.classList.toggle("work", work); c.player?.classList.toggle("work", work); }
  if (!c.player) return;
  // Lecteur : consigne de la phase et remplissage de la frise
  const st = c.steps, i = c.spec.gen ? 0 : c.segIndex[seg];
  if (seg !== c.seg) {
    c.seg = seg;
    if (!st[i].quiet) {
      c.label.textContent = st[i].label;
      c.sec.textContent = secs(st[i].dur);
    }
  }
  c.fills.forEach((f, j) => { f.style.transform = `scaleX(${j < i ? 1 : j > i ? 0 : u.toFixed(3)})`; });
}

function bindPlayer(el) {
  el.dataset.bound = "1";
  const svg = el.querySelector("svg[data-fig]");
  if (!svg) return;
  const c = clockOf(svg);
  c.player = el;
  c.steps = steps(c.spec);
  // segment du cycle (0–3) → étape affichée (les pauses trop courtes sont fusionnées)
  c.segIndex = [];
  let j = -1;
  (c.spec.tempo || [0]).forEach((d, s) => { if (d >= 0.05) j++; c.segIndex[s] = Math.max(0, j); });
  c.label = el.querySelector('[data-pl="label"]');
  c.sec = el.querySelector('[data-pl="sec"]');
  c.fills = [...el.querySelectorAll(".pl-line b")];
  const btn = el.querySelector('[data-act="toggle"]'), speed = el.querySelector('[data-act="speed"]');
  const sync = () => {
    btn.innerHTML = c.paused ? ICO.play : ICO.pause;
    btn.setAttribute("aria-label", c.paused ? "Lire l'animation" : "Mettre en pause");
    speed.setAttribute("aria-pressed", String(c.speed < 1));
    el.classList.toggle("paused", c.paused);
  };
  el.addEventListener("click", (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act || (ev.target.closest("svg") ? "toggle" : null);
    if (act === "toggle") c.paused = !c.paused;
    else if (act === "speed") c.speed = c.speed < 1 ? 1 : 0.5;
    else return;
    if (!svg.classList.contains("anim")) svg.classList.add("anim");
    sync();
    kick();
  });
  sync();
}

/** À appeler après chaque rendu : anime les schémas `data-fig` présents à l'écran et branche les lecteurs. */
export function startFigures(root = document) {
  root.querySelectorAll("[data-player]:not([data-bound])").forEach(bindPlayer);
  if (!io) return;
  root.querySelectorAll("svg[data-fig]").forEach((svg) => { if (!svg.dataset.obs) { svg.dataset.obs = 1; io.observe(svg); } });
  kick();
}

/** Pour tools/check-figures.mjs : points du corps sur un cycle complet, et aux deux extrémités. */
export function sampleFigure(id, n = 400) {
  const spec = specOf(id);
  const pts = (pose) => {
    const J = solve(spec, pose);
    const out = {};
    for (const [k, v] of Object.entries(J)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && k !== "c") out[k] = v;
    if (J.side) {
      [out.heel1, out.toe1] = footPts(J.n1, J.f1);
      [out.heel2, out.toe2] = footPts(J.n2, J.f2);
    }
    return out;
  };
  const total = cycleOf(spec);
  return {
    spec, total,
    frames: Array.from({ length: n + 1 }, (_, i) => pts(at(spec, (total * i) / n).pose)),
    a: spec.gen ? null : pts(keyPose(spec, "a")), b: spec.gen ? null : pts(keyPose(spec, "b")),
  };
}
export const FIGURE_IDS = Object.keys(F);

// ───────────────────────── Carte des muscles (face + dos), dessinée avec le même personnage

const MAP_POSE = (cx) => ({ c: [cx, 47], a: [84, 88], l: [87, 90] });

/**
 * Silhouettes face et dos, muscles colorés. `p` : principaux, `s` : secondaires,
 * ou `heat` : { muscle: 0–1 } pour une carte de volume.
 */
export function muscleMap({ p = [], s = [], heat = null } = {}, cls = "") {
  const levelOf = (k) => {
    if (heat) { const v = heat[k] || 0; return v >= 0.66 ? "p" : v >= 0.33 ? "s" : v > 0 ? "t" : "o"; }
    return p.includes(k) ? "p" : s.includes(k) ? "s" : "o";
  };
  const paint = { n: "mm-base", f: "mm-base", vol: false, m: (m) => `mm-${levelOf(m)}` };
  const side = (view, cx) => toSvg(bodyFront(solveFront(MAP_POSE(cx)), paint, view === "back"));
  return `<svg class="mmap ${cls}" viewBox="0 0 100 98" role="img" aria-label="Muscles sollicités">
    <g>${side("front", 25)}</g><g>${side("back", 75)}</g>
  </svg>`;
}
