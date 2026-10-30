// Schémas des exercices : silhouette articulée (vue de profil ou de face) + matériel, animée entre
// la position de départ (a) et d'arrivée (b). Les membres sont posés par angles ou par cible
// (cinématique inverse : A1/L1 = [x, y, sens du coude/genou]) pour garder mains et pieds en place.
// Angles en degrés, 0 = vers la droite (le sens du regard), 90 = vers le bas. Sol à y = 90.
import { EXERCISES, MOVES } from "./exercises.js";

const LEN = { T: 24, UA: 14, FA: 13, TH: 19, SH: 19, FT: 6.5, HD: 9.5, HR: 5.6, SW: 7.5, HW: 4.5 };
const G = 90;
const rad = (d) => (d * Math.PI) / 180;
const P = (p, a, l) => [p[0] + l * Math.cos(rad(a)), p[1] + l * Math.sin(rad(a))];
const ang = (p, q) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
const f1 = (n) => Math.round(n * 10) / 10;

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

/** Positions des articulations d'une pose de profil. */
function solveSide(p) {
  const hip = p.hip, t = p.t ?? -90, rel = p.ar ? t : 0;
  const s = P(hip, t, LEN.T);
  const hd = P(s, t + (p.h || 0), LEN.HD);
  const [e1, w1] = limb(s, p.a1, p.A1, LEN.UA, LEN.FA, 1, rel);
  const [e2, w2] = limb(s, p.a2 || (p.A2 ? null : p.a1), p.A2 || (p.a2 ? null : p.A1), LEN.UA, LEN.FA, 1, rel);
  const [k1, n1] = limb(hip, p.l1, p.L1, LEN.TH, LEN.SH, -1);
  const [k2, n2] = limb(hip, p.l2 || (p.L2 ? null : p.l1), p.L2 || (p.l2 ? null : p.L1), LEN.TH, LEN.SH, -1);
  const t1 = P(n1, p.f1 ?? ang(k1, n1) - 90, LEN.FT);
  const t2 = P(n2, p.f2 ?? ang(k2, n2) - 90, LEN.FT);
  return { hip, s, hd, e1, w1, e2, w2, k1, a1: n1, t1, k2, a2: n2, t2 };
}

/** Pose de face : membres droits (côté droit de l'écran) en miroir, sauf a2/l2 explicites. */
function solveFront(p) {
  const c = p.c, t = p.t ?? -90, tl = p.tl ?? 1;
  const neck = P(c, t, LEN.T * tl);
  const hd = P(neck, t + (p.h || 0), LEN.HD * (p.hl ?? 1));
  const s1 = P(neck, t + 90, LEN.SW), s2 = P(neck, t - 90, LEN.SW);
  const h1 = P(c, t + 90, LEN.HW), h2 = P(c, t - 90, LEN.HW);
  const mir = (a) => a && [180 - a[0], 180 - a[1]];
  const mirT = (q) => q && [2 * c[0] - q[0], q[1], -(q[2] ?? 1)];
  const [e1, w1] = limb(s1, p.a, p.A, LEN.UA, LEN.FA, 1);
  const [e2, w2] = limb(s2, p.a2 || mir(p.a), p.A2 || mirT(p.A), LEN.UA, LEN.FA, -1);
  const [k1, n1] = limb(h1, p.l, p.L, LEN.TH, LEN.SH, 1);
  const [k2, n2] = limb(h2, p.l2 || mir(p.l), p.L2 || mirT(p.L), LEN.TH, LEN.SH, -1);
  return { c, neck, hd, s1, s2, h1, h2, e1, w1, e2, w2, k1, a1: n1, t1: [n1[0] + 3.5, n1[1] + 1], k2, a2: n2, t2: [n2[0] - 3.5, n2[1] + 1] };
}

// ───────────────────────── Tracé

const SEG_OF = {
  chest: "torso", delts: "torso", rear: "torso", traps: "torso", upperback: "torso", lats: "torso", abs: "torso",
  obliques: "torso", lowerback: "torso", biceps: "ua", triceps: "ua", forearms: "fa", glutes: "th", quads: "th",
  hamstrings: "th", adductors: "th", calves: "sh",
};

const line = (a, b, cls, w) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="${cls}" stroke-width="${w}"/>`;
const pl = (pts, cls, w) => `<polyline points="${pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(" ")}" class="${cls}" stroke-width="${w}"/>`;

function propsSvg(props = [], J, layer) {
  let out = "";
  for (const pr of props) {
    const front = ["bar", "db", "grip", "pad", "plate"].includes(pr.k);
    if ((layer === "front") !== front) continue;
    const at = typeof pr.at === "string" ? J[pr.at] : pr.at;
    const q = at && [at[0] + (pr.dx || 0), at[1] + (pr.dy || 0)];
    switch (pr.k) {
      case "bar": out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${pr.r || 7.5}" class="kit-ring"/><circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="1.8" class="kit-fill"/>`; break;
      case "db": out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${pr.r || 3.8}" class="kit-fill"/><circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="1.2" class="kit-hub"/>`; break;
      case "grip": out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="2.2" class="kit-fill"/>`; break;
      case "pad": out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${pr.r || 3.4}" class="kit-fill"/>`; break;
      case "plate": out += line(P(q, pr.ang, pr.len / 2), P(q, pr.ang + 180, pr.len / 2), "kit", 4); break;
      case "bench": {
        const [[x1, y1], [x2, y2]] = pr.p;
        out += line([x1, y1], [x2, y2], "kit", 5);
        for (const x of pr.legs || []) out += line([x, y1 + ((y2 - y1) * (x - x1)) / (x2 - x1 || 1)], [x, G], "kit-thin", 2.4);
        break;
      }
      case "line": out += pl(pr.p, pr.thin ? "kit-thin" : "kit", pr.w || 2.6); break;
      case "box": out += `<rect x="${pr.r[0]}" y="${pr.r[1]}" width="${pr.r[2]}" height="${pr.r[3]}" rx="1.5" class="kit-box"/>`; break;
      case "pbar": out += line([pr.at[0] - 15, pr.at[1]], [pr.at[0] + 15, pr.at[1]], "kit", 3); break;
      case "ring": out += `<circle cx="${pr.c[0]}" cy="${pr.c[1]}" r="${pr.r}" class="kit-ring" stroke-width="${pr.w || 2}"/>`; break;
      case "cable": {
        const from = J[pr.from];
        out += line(from, pr.to, "kit-thin", 1.2) + `<circle cx="${pr.to[0]}" cy="${pr.to[1]}" r="2.6" class="kit-fill"/>`;
        break;
      }
    }
  }
  return out;
}

function bodySide(J, p, hl, ghost) {
  const c = (seg, far) => (ghost ? "g" : hl.has(seg) ? (far ? "hf" : "h") : far ? "f" : "n");
  const torsoPath = () => {
    const bow = p.bow || 0;
    const mid = [(J.hip[0] + J.s[0]) / 2, (J.hip[1] + J.s[1]) / 2];
    const a = ang(J.hip, J.s) - 90;
    const q = P(mid, a, bow);
    return `<path d="M${f1(J.hip[0])},${f1(J.hip[1])} Q${f1(q[0])},${f1(q[1])} ${f1(J.s[0])},${f1(J.s[1])}" class="b-${c("torso")}" stroke-width="10"/>`;
  };
  return (
    // membres du côté opposé (derrière)
    line(J.hip, J.k2, `b-${c("th", 1)}`, 6.6) + line(J.k2, J.a2, `b-${c("sh", 1)}`, 5.6) + line(J.a2, J.t2, `b-${c("x", 1)}`, 4.4) +
    line(J.s, J.e2, `b-${c("ua", 1)}`, 6) + line(J.e2, J.w2, `b-${c("fa", 1)}`, 5) +
    // tronc et tête
    torsoPath() + `<circle cx="${f1(J.hd[0])}" cy="${f1(J.hd[1])}" r="${LEN.HR}" class="hd-${ghost ? "g" : "n"}"/>` +
    // membres du côté visible
    line(J.hip, J.k1, `b-${c("th")}`, 6.6) + line(J.k1, J.a1, `b-${c("sh")}`, 5.6) + line(J.a1, J.t1, `b-${c("x")}`, 4.4) +
    line(J.s, J.e1, `b-${c("ua")}`, 6) + line(J.e1, J.w1, `b-${c("fa")}`, 5)
  );
}

function bodyFront(J, p, hl, ghost) {
  const c = (seg) => (ghost ? "g" : hl.has(seg) ? "h" : "n");
  const tc = c("torso");
  return (
    line(J.h1, J.k1, `b-${c("th")}`, 6.6) + line(J.k1, J.a1, `b-${c("sh")}`, 5.6) + line(J.a1, J.t1, `b-${c("x")}`, 4) +
    line(J.h2, J.k2, `b-${c("th")}`, 6.6) + line(J.k2, J.a2, `b-${c("sh")}`, 5.6) + line(J.a2, J.t2, `b-${c("x")}`, 4) +
    `<polygon points="${[J.s1, J.s2, J.h2, J.h1].map((q) => `${f1(q[0])},${f1(q[1])}`).join(" ")}" class="b-${tc} tf-${tc}" stroke-width="4"/>` +
    `<circle cx="${f1(J.hd[0])}" cy="${f1(J.hd[1])}" r="${LEN.HR}" class="hd-${ghost ? "g" : "n"}"/>` +
    line(J.s1, J.e1, `b-${c("ua")}`, 6) + line(J.e1, J.w1, `b-${c("fa")}`, 5) +
    line(J.s2, J.e2, `b-${c("ua")}`, 6) + line(J.e2, J.w2, `b-${c("fa")}`, 5)
  );
}

function drawPose(spec, pose, hl, { ghost = false, props = true } = {}) {
  const front = spec.view === "front";
  const J = front ? solveFront(pose) : solveSide(pose);
  const body = front ? bodyFront(J, pose, hl, ghost) : bodySide(J, pose, hl, ghost);
  const inner = props ? propsSvg(spec.props, J, "back") + body + propsSvg(spec.props, J, "front") : body;
  return pose.rot ? `<g transform="rotate(${f1(pose.rot[0])} ${pose.rot[1]} ${pose.rot[2]})">${inner}</g>` : inner;
}

function lerp(a, b, t) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerp(x, b[i], t));
  if (a && b && typeof a === "object") {
    const o = { ...a };
    for (const k of Object.keys(b)) o[k] = k in a ? lerp(a[k], b[k], t) : b[k];
    return o;
  }
  return t < 0.5 ? a : b;
}

// ───────────────────────── Poses

const STAND = { hip: [50, 52], t: -90, a1: [90, 90], L1: [51, 90] };
const LIE = { hip: [56, 71], t: 180, L1: [70, G] }; // allongé sur un banc plat
const FLAT_BENCH = { k: "bench", p: [[12, 78.5], [68, 78.5]], legs: [18, 60] };
const S = (o) => ({ ...STAND, ...o });

// Squat : barre sur le dos (bras liés au buste), pieds fixes
const squatA = { hip: [50, 52], t: -88, L1: [52, G] };
const squatB = { hip: [39, 69], t: -52, L1: [52, G] };
const pushTop = { hip: [44.6, 72.8], t: -27, A1: [66, 89], L1: [10, G], h: 10 };
const pushBot = { hip: [42.4, 84.2], t: -10, A1: [64, 89, 1], L1: [10, G], h: 10 };
const hang = { hip: [50, 53], t: -90, A1: [51, 2, 1], l1: [96, 140] };
const curlA = S({ a1: [90, 90] }), curlB = S({ a1: [92, -72] });

const F = {
  back_squat:   { a: { ...squatA, ar: 1, a1: [238, 28] }, b: { ...squatB, ar: 1, a1: [238, 28] }, props: [{ k: "bar", at: "w1" }] },
  front_squat:  { a: { ...squatA, ar: 1, a1: [83, 288] }, b: { hip: [42, 72], t: -66, L1: [52, G], ar: 1, a1: [83, 288] }, props: [{ k: "bar", at: "w1" }] },
  goblet_squat: { a: { ...squatA, ar: 1, a1: [148, -12] }, b: { hip: [41, 72], t: -62, L1: [52, G], ar: 1, a1: [148, -12] }, props: [{ k: "db", at: "w1", r: 4.6 }] },
  bw_squat:     { a: { ...squatA, a1: [0, 0] }, b: { hip: [40, 70], t: -55, L1: [52, G], a1: [0, 0] } },
  jump_squat:   { a: { hip: [44, 64], t: -62, L1: [52, G], a1: [150, 150] }, b: { hip: [50, 44], t: -90, L1: [51, 82], f1: 60, a1: [-80, -80] } },
  leg_press: {
    a: { hip: [36, 70], t: -128, L1: [58, 54], a1: [60, 40] }, b: { hip: [36, 70], t: -128, L1: [67, 46], a1: [60, 40] },
    props: [{ k: "line", p: [[50, 66], [88, 36]], thin: 1, w: 2 }, { k: "bench", p: [[24, 76], [44, 74]], legs: [28, 40] }, { k: "line", p: [[36, 75], [15, 50]], w: 5 }, { k: "plate", at: "a1", ang: 52, len: 22, dx: 3, dy: -2 }],
  },
  rdl:          { a: S({ hip: [50, 53], L1: [52, G] }), b: { hip: [42, 54], t: -18, a1: [90, 90], L1: [52, G] }, props: [{ k: "bar", at: "w1" }] },
  db_rdl:       { a: S({ hip: [50, 53], L1: [52, G] }), b: { hip: [42, 54], t: -18, a1: [90, 90], L1: [52, G] }, props: [{ k: "db", at: "w1" }] },
  deadlift:     { a: { hip: [40, 67], t: -32, a1: [90, 90], L1: [52, G] }, b: { hip: [50, 52], t: -92, a1: [90, 90], L1: [52, G] }, props: [{ k: "bar", at: "w1" }] },
  hip_thrust: {
    a: { hip: [42, 82], t: 209, h: 20, A1: [44, 76], L1: [66, G] }, b: { hip: [48, 71], t: 180, h: 20, A1: [48, 66], L1: [66, G] },
    props: [{ k: "bench", p: [[4, 79], [26, 79]], legs: [8, 22] }, { k: "bar", at: "hip", dy: -7 }],
  },
  glute_bridge: { a: { hip: [42, 85], t: 180, h: 0, A1: [40, 89], L1: [64, 89] }, b: { hip: [46, 76], t: 157, h: 23, A1: [44, 89], L1: [64, 89] } },
  bulgarian: {
    a: { hip: [48, 54], t: -85, a1: [90, 90], L1: [60, G], L2: [24, 71], f2: 180 }, b: { hip: [44, 68], t: -75, a1: [90, 90], L1: [60, G], L2: [24, 71], f2: 180 },
    props: [{ k: "bench", p: [[10, 76.5], [32, 76.5]], legs: [14, 28] }, { k: "db", at: "w1" }],
  },
  walking_lunge: { a: S({ L1: [60, G], L2: [42, G] }), b: { hip: [48, 70], t: -90, a1: [90, 90], L1: [64, G], L2: [30, 89], f2: 15 }, props: [{ k: "db", at: "w1" }] },
  reverse_lunge: { a: S({ hip: [56, 52], L1: [58, G], L2: [56, G] }), b: { hip: [50, 70], t: -90, a1: [90, 90], L1: [64, G], L2: [32, 89], f2: 15 }, props: [{ k: "db", at: "w1" }] },
  step_up: {
    a: { hip: [42, 56], t: -86, a1: [90, 90], L1: [62, 69], L2: [40, G] }, b: { hip: [58, 33], t: -90, a1: [90, 90], L1: [62, 69], L2: [54, 58] },
    props: [{ k: "box", r: [52, 71, 28, 19] }, { k: "db", at: "w1" }],
  },
  leg_curl: {
    a: { hip: [46, 70], t: 0, h: -8, A1: [78, 80], l1: [180, 180], f1: 90 }, b: { hip: [46, 70], t: 0, h: -8, A1: [78, 80], l1: [180, -60] },
    props: [{ k: "bench", p: [[8, 78.5], [74, 78.5]], legs: [14, 66] }, { k: "pad", at: "a1", dy: -3 }],
  },
  single_leg_rdl: {
    a: S({ hip: [50, 53], L1: [52, G], L2: [47, 87] }), b: { hip: [48, 54], t: -8, a1: [90, 90], L1: [52, G], l2: [172, 172], f2: 90 },
    props: [{ k: "db", at: "w1" }],
  },
  slider_curl: { a: { hip: [46, 80], t: 168, h: 12, A1: [42, 89], L1: [82, 88], f1: -100 }, b: { hip: [46, 74], t: 155, h: 25, A1: [42, 89], L1: [64, 88] } },
  leg_extension: {
    a: { hip: [38, 61], t: -95, A1: [44, 66], l1: [0, 90] }, b: { hip: [38, 61], t: -95, A1: [44, 66], l1: [0, -5] },
    props: [{ k: "bench", p: [[28, 67.5], [54, 67.5]], legs: [34, 50] }, { k: "line", p: [[30, 66], [26, 36]], w: 5 }, { k: "pad", at: "a1", dy: -3 }],
  },
  wall_sit: { a: { hip: [30, 68], t: -90, A1: [46, 66], L1: [52, G] }, b: { hip: [30, 69], t: -90, A1: [46, 67], L1: [52, G] }, props: [{ k: "line", p: [[23, 14], [23, G]], w: 3 }] },
  cable_kickback: {
    a: { hip: [46, 52], t: -70, A1: [72, 42], L1: [48, 88], L2: [50, G] }, b: { hip: [46, 52], t: -70, A1: [72, 42], l1: [150, 160], L2: [50, G] },
    props: [{ k: "line", p: [[76, 8], [76, G]], w: 4 }, { k: "cable", from: "a1", to: [74, 84] }],
  },
  frog_pump:    null, // même schéma que le pont fessier
  standing_calf: {
    a: { hip: [50, 44], t: -90, a1: [60, -70], L1: [50, 82], f1: 15 }, b: { hip: [50, 39], t: -90, a1: [60, -70], L1: [50, 77], f1: 62 },
    props: [{ k: "box", r: [44, 84, 22, 6] }, { k: "pad", at: "s", dy: -4, dx: 2 }],
  },
  db_calf:       { a: { hip: [50, 44], t: -90, a1: [90, 90], L1: [50, 82], f1: 15 }, b: { hip: [50, 39], t: -90, a1: [90, 90], L1: [50, 77], f1: 62 }, props: [{ k: "box", r: [44, 84, 22, 6] }, { k: "db", at: "w1" }] },
  calf_raise_bw: { a: { hip: [50, 44], t: -90, a1: [80, 80], L1: [50, 82], f1: 15 }, b: { hip: [50, 39], t: -90, a1: [80, 80], L1: [50, 77], f1: 62 }, props: [{ k: "box", r: [44, 84, 22, 6] }] },

  bench_press:  { a: { ...LIE, A1: [34, 44] }, b: { ...LIE, A1: [37, 61] }, props: [FLAT_BENCH, { k: "bar", at: "w1" }] },
  db_bench:     { a: { ...LIE, A1: [34, 44] }, b: { ...LIE, A1: [37, 61] }, props: [FLAT_BENCH, { k: "db", at: "w1" }] },
  incline_db: {
    a: { hip: [44, 74], t: -130, L1: [66, G], A1: [30, 28] }, b: { hip: [44, 74], t: -130, L1: [66, G], A1: [33, 48] },
    props: [{ k: "bench", p: [[38, 81], [60, 81]], legs: [44, 56] }, { k: "line", p: [[39, 79], [18, 54]], w: 5 }, { k: "db", at: "w1" }],
  },
  chest_press: {
    a: { hip: [36, 66], t: -100, L1: [56, G], A1: [46, 42] }, b: { hip: [36, 66], t: -100, L1: [56, G], A1: [59, 41] },
    props: [{ k: "bench", p: [[26, 72.5], [48, 72.5]], legs: [30, 44] }, { k: "line", p: [[27, 71], [22, 34]], w: 5 }, { k: "grip", at: "w1" }],
  },
  dips: {
    a: { hip: [54, 53], t: -95, A1: [52, 56], l1: [110, 170] }, b: { hip: [56, 64], t: -100, A1: [52, 56], l1: [110, 170] },
    props: [{ k: "line", p: [[38, 56], [68, 56]], w: 3 }, { k: "line", p: [[64, 56], [64, G]], thin: 1, w: 2.4 }],
  },
  pushup:       { a: pushTop, b: pushBot },
  incline_pushup: {
    a: { hip: [41.9, 63.8], t: -41, A1: [62, 74], L1: [12, G], h: 10 }, b: { hip: [44.4, 74.4], t: -26, A1: [64, 74, 1], L1: [12, G], h: 10 },
    props: [{ k: "bench", p: [[56, 76.5], [86, 76.5]], legs: [60, 82] }],
  },
  cable_fly: {
    view: "front", a: { c: [50, 52], a: [-18, -8], l: [86, 90] }, b: { c: [50, 52], A: [52, 42], l: [86, 90] },
    props: [{ k: "line", p: [[95, 2], [95, G]], thin: 1, w: 3 }, { k: "line", p: [[5, 2], [5, G]], thin: 1, w: 3 }, { k: "cable", from: "w1", to: [93, 6] }, { k: "cable", from: "w2", to: [7, 6] }, { k: "grip", at: "w1" }, { k: "grip", at: "w2" }],
  },
  db_fly: {
    view: "front", a: { c: [50, 50], a: [-4, 4], l: [90, 90], rot: [90, 50, 44] }, b: { c: [50, 50], A: [52, 38], l: [90, 90], rot: [90, 50, 44] },
    props: [{ k: "db", at: "w1" }, { k: "db", at: "w2" }],
  },

  barbell_row:  { a: { hip: [42, 54], t: -25, a1: [90, 90], L1: [52, G] }, b: { hip: [42, 54], t: -25, A1: [54, 62], L1: [52, G] }, props: [{ k: "bar", at: "w1" }] },
  db_row: {
    a: { hip: [32, 54], t: -5, a1: [90, 90], A2: [58, 76], L1: [44, G], l2: [90, 180], f2: 90 }, b: { hip: [32, 54], t: -5, A1: [46, 60], A2: [58, 76], L1: [44, G], l2: [90, 180], f2: 90 },
    props: [{ k: "bench", p: [[10, 78.5], [64, 78.5]], legs: [16, 58] }, { k: "db", at: "w1" }],
  },
  cable_row: {
    a: { hip: [30, 78], t: -80, A1: [57, 58], L1: [62, 82] }, b: { hip: [30, 78], t: -98, A1: [38, 66], L1: [62, 82] },
    props: [{ k: "bench", p: [[12, 85.5], [48, 85.5]], legs: [18, 42] }, { k: "line", p: [[66, 70], [66, G]], w: 3 }, { k: "cable", from: "w1", to: [92, 64] }, { k: "line", p: [[94, 40], [94, G]], thin: 1, w: 3 }, { k: "grip", at: "w1" }],
  },
  inverted_row: {
    a: { hip: [59.1, 79.4], t: 195.5, A1: [36, 46], L1: [95, 89], f1: -80 }, b: { hip: [62.4, 68.7], t: 212, A1: [36, 46, -1], L1: [95, 89], f1: -80 },
    props: [{ k: "pbar", at: [36, 46] }, { k: "line", p: [[22, 46], [22, G]], thin: 1, w: 2.4 }],
  },
  pullup:       { a: hang, b: { ...hang, hip: [50, 39], A1: [51, 2, 1] }, props: [{ k: "pbar", at: [51, 2] }], noFloor: true },
  lat_pulldown: {
    a: { hip: [44, 70], t: -95, A1: [47, 17], L1: [62, G] }, b: { hip: [44, 70], t: -100, A1: [48, 42], L1: [62, G] },
    props: [{ k: "bench", p: [[32, 76.5], [56, 76.5]], legs: [44] }, { k: "pad", at: [60, 64] }, { k: "cable", from: "w1", to: [47, 0] }, { k: "line", p: [[38, 0], [56, 0]], w: 3 }],
  },
  db_pullover:  { a: { ...LIE, a1: [194, 194] }, b: { ...LIE, a1: [-82, -82] }, props: [FLAT_BENCH, { k: "db", at: "w1", r: 4.6 }] },

  ohp:          { a: S({ a1: [60, -80] }), b: S({ a1: [-88, -88] }), props: [{ k: "bar", at: "w1" }] },
  db_shoulder: {
    a: { hip: [42, 72], t: -90, L1: [60, G], a1: [60, -80] }, b: { hip: [42, 72], t: -90, L1: [60, G], a1: [-86, -86] },
    props: [{ k: "bench", p: [[32, 78.5], [54, 78.5]], legs: [36, 50] }, { k: "line", p: [[35, 77], [35, 40]], w: 5 }, { k: "db", at: "w1" }],
  },
  pike_pushup:  { a: { hip: [40, 50], t: 52.4, A1: [70, 89], L1: [26, 89] }, b: { hip: [42, 54], t: 62, A1: [70, 89, 1], L1: [26, 89] } },
  lateral_raise: { view: "front", a: { c: [50, 52], a: [82, 86], l: [88, 90] }, b: { c: [50, 52], a: [-4, 4], l: [88, 90] }, props: [{ k: "db", at: "w1" }, { k: "db", at: "w2" }] },
  face_pull: {
    a: S({ a1: [-12, -12] }), b: S({ a1: [200, -40] }),
    props: [{ k: "line", p: [[94, 0], [94, G]], thin: 1, w: 3 }, { k: "cable", from: "w1", to: [92, 16] }, { k: "grip", at: "w1" }],
  },
  reverse_fly: { view: "front", a: { c: [50, 56], tl: 0.62, hl: 0.7, a: [92, 92], l: [94, 86] }, b: { c: [50, 56], tl: 0.62, hl: 0.7, a: [2, 6], l: [94, 86] }, props: [{ k: "db", at: "w1" }, { k: "db", at: "w2" }] },
  y_raise:      { a: { hip: [36, 85], t: 0, h: -6, a1: [5, 5], l1: [180, 180], f1: 90 }, b: { hip: [36, 85], t: -5, h: -12, a1: [-16, -16], l1: [180, 180], f1: 90 } },

  db_curl:      { a: curlA, b: curlB, props: [{ k: "db", at: "w1" }] },
  barbell_curl: { a: curlA, b: curlB, props: [{ k: "bar", at: "w1" }] },
  triceps_pushdown: {
    a: S({ t: -85, a1: [100, -30] }), b: S({ t: -85, a1: [96, 90] }),
    props: [{ k: "line", p: [[76, 0], [76, G]], thin: 1, w: 3 }, { k: "cable", from: "w1", to: [72, 2] }, { k: "grip", at: "w1" }],
  },
  overhead_ext: { a: S({ a1: [-75, 140] }), b: S({ a1: [-82, -82] }), props: [{ k: "db", at: "w1", r: 4.6 }] },
  skull_crusher: { a: { ...LIE, a1: [-100, -100] }, b: { ...LIE, a1: [-100, 168] }, props: [FLAT_BENCH, { k: "bar", at: "w1" }] },
  bench_dip: {
    a: { hip: [40, 61], t: -90, A1: [38, 63], L1: [72, 89] }, b: { hip: [41, 74], t: -90, A1: [38, 63, 1], L1: [72, 89] },
    props: [{ k: "bench", p: [[12, 66.5], [36, 66.5]], legs: [16, 32] }],
  },

  plank:        { a: { hip: [41.1, 79.2], t: -17.5, a1: [90, 0], L1: [6, G], h: 8 }, b: { hip: [41.1, 78], t: -19, a1: [90, 0], L1: [6, G], h: 8 } },
  side_plank:   { view: "front", a: { c: [16, 48], a: [20, -70], a2: [-160, -160], l: [90, 90], rot: [75, 16, 88] }, b: { c: [16, 48], a: [20, -70], a2: [-160, -160], l: [90, 90], rot: [71, 16, 88] } },
  dead_bug:     { a: { hip: [52, 84], t: 180, a1: [-90, -90], l1: [-90, 0] }, b: { hip: [52, 84], t: 180, a1: [190, 190], a2: [-90, -90], l1: [-5, -5], l2: [-90, 0] } },
  hanging_knee: { a: { ...hang, l1: [94, 86] }, b: { ...hang, l1: [-20, 90] }, props: [{ k: "pbar", at: [51, 2] }], noFloor: true },
  crunch:       { a: { hip: [52, 84], t: 180, h: 0, a1: [0, 0], L1: [70, 89] }, b: { hip: [52, 84], t: 205, h: 25, a1: [-10, -10], L1: [70, 89] } },
  mountain_climber: { a: pushTop, b: { ...pushTop, L1: undefined, l1: [25, 150], f1: 90, L2: [10, G] } },
  bird_dog: {
    a: { hip: [36, 68], t: -14.5, h: -8, a1: [90, 90], l1: [90, 180], f1: 90 },
    b: { hip: [36, 68], t: -14.5, h: -8, a1: [90, 90], a2: [-6, -6], l1: [178, 178], l2: [90, 180], f1: 90, f2: 90 },
  },
  farmer_carry: { a: S({ L1: [58, G], L2: [42, G] }), b: S({ L1: [42, G], L2: [58, G] }), props: [{ k: "db", at: "w1", r: 4.4 }] },

  // ── Récupération
  walk:       { a: S({ a1: [70, 100], a2: [110, 90], L1: [60, G], L2: [41, G] }), b: S({ a1: [110, 90], a2: [70, 100], L1: [41, G], L2: [60, G] }) },
  bike_easy: {
    a: { hip: [40, 50], t: -62, A1: [67, 45], L1: [59, 76], L2: [41, 76] }, b: { hip: [40, 50], t: -62, A1: [67, 45], L1: [50, 85], L2: [50, 67] },
    props: [{ k: "ring", c: [24, 78], r: 11 }, { k: "ring", c: [80, 78], r: 11 }, { k: "line", p: [[24, 78], [50, 76], [68, 50], [80, 78]], w: 2.4 }, { k: "line", p: [[50, 76], [40, 54]], w: 2.4 }, { k: "line", p: [[68, 50], [66, 44], [71, 44]], w: 2.4 }],
  },
  cat_cow:    { a: { hip: [36, 68], t: -14.5, h: -35, bow: -5, a1: [90, 90], l1: [90, 180], f1: 90 }, b: { hip: [36, 68], t: -14.5, h: 40, bow: 7, a1: [90, 90], l1: [90, 180], f1: 90 } },
  child_pose: { a: { hip: [36, 76], t: 2, h: 10, bow: 3, a1: [5, 0], l1: [24, 180], f1: 90 }, b: { hip: [34, 80], t: 5, h: 12, bow: 4, a1: [5, 0], l1: [20, 180], f1: 90 } },
  t_rotation: { a: { hip: [44, 68], t: -40, a1: [80, 85], L1: [64, G], L2: [16, 88], f2: 15 }, b: { hip: [44, 68], t: -40, a1: [80, 85], a2: [-88, -88], L1: [64, G], L2: [16, 88], f2: 15 } },
  hip_9090:   { a: { hip: [44, 84], t: -90, A1: [30, 88], l1: [-30, 60] }, b: { hip: [44, 84], t: -90, A1: [30, 88], l1: [12, 100] } },
  hip_flexor: { a: { hip: [46, 68], t: -90, a1: [120, 45], L1: [66, G], L2: [23, 87], f2: 180 }, b: { hip: [50, 70], t: -96, a1: [120, 45], L1: [66, G], L2: [23, 87], f2: 180 } },
  figure4:    { a: { hip: [52, 84], t: 180, a1: [0, 0], L1: [70, 89], l2: [-50, 30] }, b: { hip: [52, 84], t: 180, A1: [60, 70], L1: [62, 68], l2: [-62, 20] } },
  ham_stretch: { a: { hip: [52, 84], t: 180, A1: [56, 72], l1: [-70, -70], l2: [0, 0], f1: 0 }, b: { hip: [52, 84], t: 180, A1: [51, 72], l1: [-95, -95], l2: [0, 0], f1: -10 } },
  breathing:  { a: { hip: [52, 84], t: 180, a1: [12, -40], L1: [70, 89], bow: 0 }, b: { hip: [52, 84], t: 180, a1: [12, -46], L1: [70, 89], bow: -3 } },
};
F.frog_pump = F.glute_bridge;
F.hammer_curl = F.db_curl;
F.bw_lateral = { ...F.lateral_raise, props: [] };
F.diamond_pushup = F.pushup;
F.chinup = F.pullup;
F.negative_pullup = { a: F.pullup.b, b: F.pullup.a, props: F.pullup.props, noFloor: true };
F.step_up_bw = F.step_up;

// ───────────────────────── API

function infoOf(id) {
  return EXERCISES[id] || MOVES[id] || null;
}

function specOf(id) {
  const spec = F[id];
  if (!spec) return null;
  const ex = EXERCISES[id];
  // Au poids du corps, pas de charge à la main (pompes lestées, fentes…)
  if (ex && ex.equip.length === 1 && ex.equip[0] === "bw") return { ...spec, props: (spec.props || []).filter((p) => p.k !== "db" && p.k !== "bar") };
  return spec;
}

/**
 * SVG d'un exercice. `animate` : le schéma sera animé par `startFigures` ; sinon, position finale
 * pleine + position de départ en transparence.
 */
export function figure(id, { animate = false, cls = "" } = {}) {
  const spec = specOf(id);
  const hl = new Set((infoOf(id)?.m?.p || []).map((m) => SEG_OF[m]));
  if (!spec) return `<svg class="fig ${cls}" viewBox="0 -6 100 100" aria-hidden="true"></svg>`;
  const floor = spec.noFloor ? "" : `<line x1="2" y1="${G + 2.5}" x2="98" y2="${G + 2.5}" class="floor"/>`;
  const body = animate ? drawPose(spec, spec.b, hl) : drawPose(spec, spec.a, hl, { ghost: true, props: false }) + drawPose(spec, spec.b, hl);
  return `<svg class="fig ${cls}" viewBox="0 -6 100 100" aria-hidden="true"${animate ? ` data-fig="${id}"` : ""}>${floor}<g class="fig-body">${body}</g></svg>`;
}

export function hasFigure(id) {
  return !!F[id];
}

// Animation : une seule boucle pour tous les schémas visibles, ~30 images/s.
const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let raf = null, last = 0;
const visible = new Set();
const io = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target))))
  : null;

function phase(ms, dur = 3200) {
  const p = (ms % dur) / dur;
  const ease = (x) => x * x * (3 - 2 * x);
  if (p < 0.12) return 0;
  if (p < 0.5) return ease((p - 0.12) / 0.38);
  if (p < 0.62) return 1;
  return 1 - ease((p - 0.62) / 0.38);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < 33) return;
  last = now;
  const t = phase(now);
  for (const svg of visible) {
    if (!svg.isConnected) { visible.delete(svg); io?.unobserve(svg); continue; }
    const id = svg.dataset.fig;
    const spec = specOf(id);
    const hl = new Set((infoOf(id)?.m?.p || []).map((m) => SEG_OF[m]));
    svg.querySelector(".fig-body").innerHTML = drawPose(spec, lerp(spec.a, spec.b, t), hl);
  }
}

/** À appeler après chaque rendu : anime les schémas `data-fig` présents à l'écran. */
export function startFigures(root = document) {
  if (reduced || !io) return;
  root.querySelectorAll("svg[data-fig]").forEach((svg) => { if (!svg.dataset.obs) { svg.dataset.obs = 1; io.observe(svg); } });
  if (!raf) raf = requestAnimationFrame(frame);
}

// ───────────────────────── Carte des muscles (face + dos)

const E = (cx, cy, rx, ry, r = 0) => ({ cx, cy, rx, ry, r });
// Côté gauche de chaque silhouette ; le côté droit est obtenu en miroir.
const FRONT = {
  traps: [E(19.6, 16.8, 3.2, 1.5, 22)],
  delts: [E(13.6, 21, 3.9, 4.5, 18)],
  chest: [E(19.3, 23.8, 5.3, 4, 8)],
  biceps: [E(11.4, 30.6, 2.5, 5.1, 12)],
  forearms: [E(9.4, 41.6, 2.2, 5.5, 14)],
  obliques: [E(17.4, 37.5, 2.2, 6.2, -6)],
  quads: [E(19.7, 62, 4.3, 10, 6)],
  adductors: [E(22.6, 58, 1.5, 5.6, -10)],
  calves: [E(19.1, 83, 2.6, 7, 4)],
};
const BACK = {
  traps: [],
  rear: [E(13.6, 21, 3.9, 4.5, -18)],
  upperback: [E(20.5, 26.5, 2.6, 4, 0)],
  lats: [E(17.8, 33, 4, 8.4, 14)],
  triceps: [E(11.4, 30.6, 2.5, 5.1, -12)],
  forearms: [E(9.4, 41.6, 2.2, 5.5, -14)],
  glutes: [E(19.8, 52.6, 4.6, 5, 0)],
  hamstrings: [E(19.6, 66.5, 4.1, 8.8, -4)],
  calves: [E(19.4, 82.5, 3.1, 6.8, 0)],
};
const BASE = [`<circle cx="24" cy="8" r="5.4"/>`, `<rect x="21.5" y="12" width="5" height="5" rx="2"/>`,
  `<circle cx="8.1" cy="49.6" r="2"/>`, `<circle cx="39.9" cy="49.6" r="2"/>`, `<ellipse cx="24" cy="49.5" rx="7.6" ry="3.4"/>`,
  `<circle cx="19.4" cy="73.6" r="2.2"/>`, `<circle cx="28.6" cy="73.6" r="2.2"/>`,
  `<ellipse cx="18.8" cy="93" rx="2.6" ry="1.5"/>`, `<ellipse cx="29.2" cy="93" rx="2.6" ry="1.5"/>`].join("");

function ellipses(list, cls) {
  return list.flatMap((e) => [e, { ...e, cx: 48 - e.cx, r: -e.r }])
    .map((e) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${e.r} ${e.cx} ${e.cy})" class="${cls}"/>`).join("");
}

function side(map, extra, levelOf) {
  let out = `<g class="mm-base">${BASE}</g>`;
  for (const [k, list] of Object.entries(map)) out += ellipses(list, `mm-${levelOf(k)}`);
  return out + extra(levelOf);
}

/**
 * Silhouettes face et dos, muscles colorés. `p` : principaux, `s` : secondaires,
 * ou `heat` : { muscle: 0–1 } pour une carte de volume.
 */
export function muscleMap({ p = [], s = [], heat = null } = {}, cls = "") {
  const levelOf = (k) => {
    if (heat) { const v = heat[k] || 0; return v >= 0.66 ? "p" : v >= 0.33 ? "s" : v > 0 ? "t" : "o"; }
    return p.includes(k) ? "p" : s.includes(k) ? "s" : "o";
  };
  const abs = (lv) => [28.6, 33.6, 38.6, 43.6].map((y, i) =>
    `<rect x="20.3" y="${y}" width="3.3" height="${i === 3 ? 5.2 : 4.4}" rx="1.2" class="mm-${lv("abs")}"/><rect x="24.4" y="${y}" width="3.3" height="${i === 3 ? 5.2 : 4.4}" rx="1.2" class="mm-${lv("abs")}"/>`).join("");
  const back = (lv) => `<path d="M24 12.6 L16.4 19.2 L24 33 L31.6 19.2 Z" class="mm-${lv("traps")}"/>` +
    `<rect x="21.1" y="36" width="2.6" height="11" rx="1.2" class="mm-${lv("lowerback")}"/><rect x="24.3" y="36" width="2.6" height="11" rx="1.2" class="mm-${lv("lowerback")}"/>`;
  return `<svg class="mmap ${cls}" viewBox="0 0 100 98" role="img" aria-label="Muscles sollicités">
    <g>${side(FRONT, abs, levelOf)}</g>
    <g transform="translate(52 0)">${side(BACK, back, levelOf)}</g>
  </svg>`;
}
