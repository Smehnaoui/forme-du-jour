// Moteur d'entraînement : récupération du matin (sommeil, VFC, FC repos, ressenti) − fatigue de la
// journée (pas, sport, heures debout) = énergie du jour → séance adaptée.
// Toutes les données Google Health sont facultatives : sans elles, le score repose sur le sommeil
// (ou une nuit moyenne supposée) et le ressenti.
import { EXERCISES, MOVES, RECOVERY, pickExercise } from "./exercises.js";

export const INTENSITY = {
  peak:     { key: "peak",     label: "Au top",        short: "Perf",     icon: "rocket" },
  full:     { key: "full",     label: "Pleine forme",  short: "Intense",  icon: "flame" },
  normal:   { key: "normal",   label: "En forme",      short: "Standard", icon: "bolt" },
  light:    { key: "light",    label: "Fatigué",       short: "Léger",    icon: "feather" },
  recovery: { key: "recovery", label: "À recharger",   short: "Récup",    icon: "moon" },
};

/** Seuils de score de chaque niveau (du plus haut au plus bas). */
export const THRESHOLDS = [["peak", 85], ["full", 68], ["normal", 50], ["light", 32], ["recovery", 0]];

export function levelOf(score) {
  return THRESHOLDS.find(([, min]) => score >= min)[0];
}

const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const NO_INTENSE = 67;  // plafond « pas de séance intense »
const NO_PEAK = 84;     // plafond « pas de séance record »

// ───────────────────────── Score de sommeil

/** Note de sommeil 0–100 à partir d'une nuit. Renvoie aussi le détail lisible. */
export function sleepScore(night, targetHours = 7.5) {
  if (!night || !(night.hours >= 0)) return null;
  const parts = [];

  // Durée : 0 sous 4h30, plein score à la cible, plafonné
  const h = night.hours;
  const durRatio = Math.max(0, Math.min(1, (h - 4.5) / (targetHours - 4.5)));
  const durPts = durRatio * 55;
  parts.push({ label: "Durée", value: `${fmtHours(h)}`, pts: durPts, max: 55 });

  // Qualité : efficacité mesurée si dispo, sinon ressenti 1–5
  let qualPts;
  if (night.efficiency != null) {
    qualPts = Math.max(0, Math.min(1, (night.efficiency - 75) / 20)) * 25;
    parts.push({ label: "Efficacité", value: `${Math.round(night.efficiency)} %`, pts: qualPts, max: 25 });
  } else {
    const q = night.quality ?? 3;
    qualPts = ((q - 1) / 4) * 25;
    parts.push({ label: "Qualité ressentie", value: `${q}/5`, pts: qualPts, max: 25 });
  }

  // Sommeil profond + paradoxal : ~40 % de la nuit est un très bon signe
  let restPts;
  if (night.deepMin != null && night.remMin != null && h > 0) {
    const share = (night.deepMin + night.remMin) / (h * 60);
    restPts = Math.max(0, Math.min(1, (share - 0.2) / 0.2)) * 20;
    parts.push({ label: "Profond + paradoxal", value: `${Math.round(share * 100)} %`, pts: restPts, max: 20 });
  } else {
    // Pas de phases : on extrapole à partir des deux autres critères
    restPts = ((durPts / 55 + qualPts / 25) / 2) * 20;
  }

  return { score: Math.round(durPts + qualPts + restPts), parts };
}

// ───────────────────────── Références personnelles (Google Health)

/**
 * Valeur du jour comparée à la moyenne des `days` jours précédents.
 * null si la valeur du jour manque ; `base` null si l'historique est trop court (< `min` mesures).
 */
export function versusBaseline(daily = {}, key, today, { days = 60, min = 7, log = false } = {}) {
  const v = daily[today]?.[key];
  if (v == null || !(v > 0 || !log)) return null;
  const tf = log ? Math.log : (x) => x;
  const base = [];
  for (let i = 1; i <= days; i++) {
    const x = daily[addDays(today, -i)]?.[key];
    if (x != null && (!log || x > 0)) base.push(tf(x));
  }
  if (base.length < min) return { value: v, base: null };
  const m = mean(base), sd = stdev(base);
  return { value: v, base: log ? Math.exp(m) : m, z: sd > 0 ? (tf(v) - m) / sd : 0, n: base.length };
}

// ───────────────────────── Charge d'entraînement

const LOAD_RPE = { peak: 8.5, full: 8, normal: 7, light: 5, recovery: 2 };

/** Charge aiguë (7 j) / chronique (28 j) à partir des séances de l'app et des sports enregistrés par Google. */
export function trainingLoad(sessions = [], workouts = [], today = dateKey()) {
  const load = {};
  const add = (d, v) => { load[d] = (load[d] || 0) + v; };
  for (const s of sessions) add(s.date, (s.minutes || 45) * (LOAD_RPE[s.level] ?? 6));
  for (const w of workouts) if (!w.strength) add(w.date, (w.minutes || 0) * 6);
  const dates = Object.keys(load).sort();
  if (!dates.length || daysBetween(dates[0], today) < 14) return null; // pas assez d'historique
  const sum = (from, to) => { let t = 0; for (let i = from; i <= to; i++) t += load[addDays(today, -i)] || 0; return t; };
  const acute = sum(1, 7);
  const chronic = sum(1, 28) / 4;
  return { acute, chronic, ratio: chronic > 0 ? acute / chronic : null };
}

// ───────────────────────── Fatigue de la journée

/** Journée ressentie (saisie) : 1 calme, 2 active, 3 très physique → points d'énergie perdus. */
const DAY_DRAIN = [0, 0, 8, 16];

/**
 * Énergie déjà dépensée aujourd'hui : pas au-delà de ton rythme habituel, sport enregistré par Google,
 * journée physique déclarée, longue journée debout (amplifiée après une nuit courte). Plafonné à 30 points.
 */
export function dayStrain({ daily = {}, workouts = [], today = dateKey(), now = new Date(), night = null, checkin = null } = {}) {
  const parts = [];
  let drain = 0;

  const wake = night?.wake ? new Date(night.wake) : new Date(new Date(now).setHours(7, 0, 0, 0));
  const awakeH = Math.max(0, (now - wake) / 3600_000);

  const sport = workouts.filter((w) => w.date === today && !w.strength);
  const sportMin = sport.reduce((t, w) => t + (w.minutes || 0), 0);
  if (sportMin >= 15) {
    drain += Math.min(20, sportMin * 0.3);
    parts.push({ key: "sport", text: `${Math.round(sportMin)} min de ${sport[0].name} aujourd'hui` });
  }

  const steps = daily[today]?.steps ?? null;
  if (steps != null) {
    const past = [];
    for (let i = 1; i <= 14; i++) { const v = daily[addDays(today, -i)]?.steps; if (v > 0) past.push(v); }
    const usual = past.length >= 5 ? mean(past) : 8000;
    const expected = usual * Math.min(1, awakeH / 15); // ce que tu marches d'habitude à cette heure-ci
    let d = clamp(((steps - expected) / 1000) * 2, 0, 12) + (steps >= 15000 ? 3 : 0);
    if (sportMin >= 15) d /= 2; // une partie des pas vient déjà de la séance de sport comptée au-dessus
    if (d >= 3) parts.push({ key: "steps", text: `${fmtK(steps)} pas déjà aujourd'hui` });
    drain += d;
  }

  const declared = DAY_DRAIN[checkin?.day || 0];
  if (declared > drain) {
    drain = declared;
    parts.push({ key: "day", text: checkin.day === 3 ? "Journée très physique" : "Journée active" });
  }

  if (awakeH > 12) {
    const d = Math.min(8, (awakeH - 12) * 2) * (night && night.hours < 6.5 ? 1.5 : 1);
    if (d >= 3) parts.push({ key: "awake", text: `Debout depuis ${Math.floor(awakeH)} h` });
    drain += d;
  }

  return { drain: Math.round(Math.min(30, drain)), parts, steps, awakeH, sportMin };
}

// ───────────────────────── Énergie du jour

/**
 * Énergie du jour (0–100) = récupération du matin − fatigue de la journée.
 * Récupération : sommeil 35 · VFC 25 · ressenti 20 · FC repos 10 · charge 10 ; une donnée absente sort du
 * calcul et les autres sont repondérées. Garde-fous ensuite (maladie, dette de sommeil, surcharge…).
 */
export function readiness({ night, recentNights = [], checkin, profile, recentSessions = [], health = {}, workouts = [], today = dateKey(), now = new Date() }) {
  const reasons = [];   // { text, tone: "good" | "warn" | "bad" }
  const metrics = {};
  const parts = [];
  const why = (text, tone = "warn") => reasons.push({ text, tone });

  const s = sleepScore(night, profile.sleepTarget);
  parts.push({ key: "sleep", w: 35, v: s ? s.score : 60 }); // inconnu : on suppose une nuit moyenne

  const energy = checkin?.energy ?? 3;      // 1 = vidé, 5 = au top
  const soreness = checkin?.soreness ?? 2;  // 1 = rien, 5 = très courbaturé
  const feel = ((energy - 1) / 4) * 100 * 0.55 + ((5 - soreness) / 4) * 100 * 0.45;
  parts.push({ key: "feel", w: 20, v: feel });

  const daily = health.daily || {};
  const hrv = versusBaseline(daily, "hrv", today, { log: true });
  let recov = [];
  if (hrv) {
    metrics.hrv = hrv;
    if (hrv.base != null) {
      const v = clamp(55 + hrv.z * 20);
      parts.push({ key: "hrv", w: 25, v });
      recov.push(v);
      const pct = Math.round((hrv.value / hrv.base - 1) * 100);
      if (hrv.z <= -1) why(`VFC basse (${pct} %) : récupération incomplète`, "bad");
      else if (hrv.z >= 0.75) why(`VFC haute (+${pct} %) : bien récupéré`, "good");
    }
  }
  const rhr = versusBaseline(daily, "rhr", today);
  if (rhr) {
    metrics.rhr = rhr;
    if (rhr.base != null) {
      const delta = rhr.value - rhr.base;
      const v = clamp(70 - delta * 6);
      parts.push({ key: "rhr", w: 10, v });
      recov.push(v);
      if (delta >= 5) why(`FC au repos haute (+${Math.round(delta)} bpm)`, "bad");
    }
  }
  const load = trainingLoad(recentSessions, workouts, today);
  if (load?.ratio != null) {
    metrics.load = load;
    parts.push({ key: "load", w: 10, v: clamp(load.ratio <= 1.3 ? 85 - Math.abs(load.ratio - 1) * 30 : 85 - (load.ratio - 1.3) * 150) });
  }

  const wsum = parts.reduce((t, p) => t + p.w, 0);
  let score = parts.reduce((t, p) => t + p.w * p.v, 0) / wsum;

  // Signes possibles de maladie : au moins deux signaux nocturnes anormaux
  const signals = [];
  if (rhr?.base != null && rhr.value - rhr.base >= 5) signals.push("FC au repos");
  const resp = versusBaseline(daily, "resp", today);
  if (resp?.base != null && resp.value - resp.base >= 1.5) signals.push("respiration");
  const tempDev = daily[today]?.tempDev;
  if (tempDev != null && tempDev >= 0.5) signals.push("température");
  const spo2 = daily[today]?.spo2;
  if (spo2 != null && spo2 < 92) signals.push("oxygénation");
  if (signals.length >= 2) {
    score = Math.min(score, 30);
    why(`Signes possibles de maladie (${signals.join(", ")})`, "bad");
  } else if (rhr?.base != null && rhr.value - rhr.base >= 5) {
    const y = daily[addDays(today, -1)]?.rhr;
    if (y != null && y - rhr.base >= 5) {
      score = Math.min(score, 49);
      why("FC au repos haute deux matins de suite", "bad");
    }
  }

  // Dette de sommeil sur 3 nuits, puis sur 7 nuits
  const last3 = recentNights.slice(0, 3).filter(Boolean);
  if (last3.length >= 2) {
    const avg = last3.reduce((a, n) => a + n.hours, 0) / last3.length;
    if (avg < 6) {
      score = Math.min(score, 62);
      why(`Dette de sommeil : ${fmtHours(avg)} en moyenne sur ${last3.length} nuits`);
    }
  }
  const last7 = recentNights.slice(0, 7).filter(Boolean);
  if (last7.length >= 3) {
    const avg = last7.reduce((a, n) => a + n.hours, 0) / last7.length;
    if (avg < profile.sleepTarget - 1 && score > NO_INTENSE) {
      score = NO_INTENSE;
      why(`Semaine de sommeil courte (${fmtHours(avg)} en moyenne)`);
    }
  }
  if (!night) why("Pas de nuit enregistrée : nuit moyenne supposée");
  else if (night.hours < 5) why(`Nuit très courte (${fmtHours(night.hours)})`, "bad");
  else if (night.hours < profile.sleepTarget - 1.5) why(`Nuit courte (${fmtHours(night.hours)})`);
  else if (s?.score >= 80) why(`Très bonne nuit (${fmtHours(night.hours)})`, "good");
  if (soreness >= 4) why("Courbatures marquées");
  if (energy <= 2) why("Énergie basse ce matin");
  if (energy >= 5 && soreness <= 2) why("Tu te sens au top", "good");

  // Surcharge : beaucoup plus d'entraînement cette semaine que d'habitude
  if (load?.ratio > 1.5) {
    score = Math.min(score, 49);
    why("Charge de la semaine bien au-dessus de ton habitude");
  }

  // Sport d'endurance la veille (course, vélo, foot…) : jambes à ménager
  const yesterday = addDays(today, -1);
  const legs = workouts.filter((w) => w.date === yesterday && w.legs).reduce((t, w) => t + (w.minutes || 0), 0);
  if (legs >= 45) {
    score = Math.min(score, NO_INTENSE);
    why(`${Math.round(legs)} min de sport hier : jambes à ménager`);
  }

  // Trois jours d'affilée d'entraînement → on impose un jour plus calme
  const streak = consecutiveTrainingDays(recentSessions, today);
  if (streak >= 3) {
    score = Math.min(score, 45);
    why(`${streak} jours d'entraînement d'affilée`);
  }

  // Séance « record » seulement après une vraie bonne nuit et sans signal d'alerte
  if ((s && s.score < 75) || reasons.some((r) => r.tone !== "good")) score = Math.min(score, NO_PEAK);

  const morning = Math.round(clamp(score));
  const strain = dayStrain({ daily, workouts, today, now, night, checkin });
  for (const p of strain.parts) why(p.text);
  const final = Math.round(clamp(morning - strain.drain));
  const level = levelOf(final);
  if (!reasons.length) why(level === "recovery" || level === "light" ? "Récupération moyenne" : "Récupération correcte", level === "recovery" || level === "light" ? "warn" : "good");

  // Les 4 composantes affichées (barres 0–100) ; null = pas de donnée
  const components = [
    { key: "sleep", label: "Sommeil", value: s ? s.score : null, text: night ? fmtHours(night.hours) : "–" },
    { key: "recovery", label: "Récup", value: recov.length ? Math.round(mean(recov)) : null,
      text: hrv?.base ? `${hrv.value >= hrv.base ? "+" : ""}${Math.round((hrv.value / hrv.base - 1) * 100)} %` : rhr ? `${Math.round(rhr.value)} bpm` : "–" },
    { key: "feel", label: "Ressenti", value: checkin?.energy || checkin?.soreness ? Math.round(feel) : null, text: checkin?.energy ? `${checkin.energy}/5` : "–" },
    { key: "day", label: "Journée", value: Math.round(100 - (strain.drain / 30) * 100),
      text: strain.steps != null ? `${fmtK(strain.steps)} pas` : strain.drain ? `−${strain.drain}` : "calme" },
  ];

  return { score: final, morning, drain: strain.drain, strain, level, sleep: s, reasons, metrics, components, used: parts.map((p) => p.key) };
}

function consecutiveTrainingDays(sessions, today = dateKey()) {
  const days = new Set(sessions.filter((s) => s.level !== "recovery").map((s) => s.date));
  let n = 0;
  let d = addDays(today, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// ───────────────────────── Semaine

export const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function defaultTrainDays(n) {
  return n >= 5 ? [1, 2, 3, 5, 6] : n >= 4 ? [1, 2, 4, 5] : n <= 2 ? [2, 5] : [1, 3, 5];
}

/** Jours d'entraînement choisis (0 = dimanche). */
export function trainDaysOf(profile) {
  return profile.trainDays?.length ? profile.trainDays : defaultTrainDays(profile.days);
}

/**
 * Plan de la semaine (lundi → dimanche) et décision pour aujourd'hui :
 * "train" (jour prévu), "catchup" (séance manquée à rattraper) ou "rest".
 */
export function weekPlan(profile, sessions = [], workouts = [], now = new Date()) {
  const days = trainDaysOf(profile);
  const today = dateKey(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const lifted = new Set(sessions.filter((s) => s.level !== "recovery").map((s) => s.date));
  const sport = new Set(workouts.filter((w) => !w.strength).map((w) => w.date));
  // Les jours avant le début du programme ne sont pas des séances manquées
  const since = [profile.createdAt, sessions[sessions.length - 1]?.date].filter(Boolean).sort()[0] || today;

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dateKey(d);
    const planned = days.includes(d.getDay());
    const status = lifted.has(key) ? "done"
      : key === today ? "today"
      : key < today ? (planned && key >= since ? "missed" : "rest")
      : planned ? "planned" : "rest";
    week.push({ key, wd: d.getDay(), planned, status, sport: sport.has(key) });
  }

  const doneBefore = week.filter((d) => d.key < today && lifted.has(d.key)).length;
  const plannedBefore = week.filter((d) => d.key < today && d.key >= since && d.planned).length;
  const lastLift = sessions.find((s) => s.level !== "recovery" && s.date < today)?.date;
  const gap = lastLift ? daysBetween(lastLift, today) : Infinity;
  const fullBody = days.length < 4;

  let kind = "rest";
  let reason = "Jour de repos";
  if (days.includes(now.getDay())) {
    kind = "train";
    reason = "";
    if (fullBody && gap < 2) {
      kind = "rest";
      reason = "48 h entre deux full body : séance décalée à demain";
    }
  } else if (doneBefore < plannedBefore && gap >= (fullBody ? 2 : 1)) {
    kind = "catchup";
    reason = "Séance manquée à rattraper";
  }
  return { week, kind, reason, days };
}

// ───────────────────────── Programme

// `slots` : schémas moteurs par ordre de priorité ("schéma:n" = n-ième variante, pour varier d'une
// séance à l'autre) ; `extra` : ajoutés seulement si la durée le permet.
const SPLITS = {
  2: [
    { name: "Full body A", focus: "Jambes · Pecs · Dos", slots: ["squat", "hpush", "hpull", "hinge:2", "vpush", "biceps", "core"], extra: ["triceps", "calves"] },
    { name: "Full body B", focus: "Ischios · Dos · Épaules", slots: ["hinge", "vpull", "hpush:2", "lunge", "lateral", "triceps", "core:1"], extra: ["rear", "hamstring"] },
  ],
  3: [
    { name: "Full body A", focus: "Squat · Pecs · Dos", slots: ["squat", "hpush", "vpull", "hinge:2", "lateral", "biceps", "core"], extra: ["calves", "triceps"] },
    { name: "Full body B", focus: "Hinge · Épaules · Dos", slots: ["hinge", "vpush", "hpull", "lunge", "triceps", "rear", "core:1"], extra: ["hamstring", "biceps:1"] },
    { name: "Full body C", focus: "Jambes · Pecs · Fessiers", slots: ["squat:2", "hpush:2", "hpull:1", "glute", "fly", "biceps:1", "core:2"], extra: ["calves", "carry"] },
  ],
  4: [
    { name: "Haut du corps 1", focus: "Pecs · Dos · Bras", slots: ["hpush", "vpull", "vpush", "hpull", "lateral", "biceps", "triceps"], extra: ["rear", "core"] },
    { name: "Bas du corps 1", focus: "Quadriceps · Fessiers", slots: ["squat", "hinge", "lunge", "hamstring", "calves", "core"], extra: ["quad"] },
    { name: "Haut du corps 2", focus: "Épaules · Dos · Pecs", slots: ["vpush:1", "hpull:1", "hpush:2", "vpull:1", "fly", "rear", "biceps:1"], extra: ["triceps:1", "lateral"] },
    { name: "Bas du corps 2", focus: "Ischios · Fessiers", slots: ["hinge:3", "squat:3", "glute", "quad", "calves", "core:1"], extra: ["hamstring", "carry"] },
  ],
  5: [
    { name: "Haut du corps", focus: "Pecs · Dos · Épaules", slots: ["hpush", "vpull", "vpush", "hpull", "lateral", "core"], extra: ["biceps", "triceps"] },
    { name: "Bas du corps", focus: "Quadriceps · Ischios", slots: ["squat", "hinge", "lunge", "hamstring", "calves", "core:1"], extra: ["quad"] },
    { name: "Poussée", focus: "Pecs · Épaules · Triceps", slots: ["hpush:2", "vpush:1", "hpush:4", "lateral", "fly", "triceps", "triceps:1"], extra: ["core:2"] },
    { name: "Tirage", focus: "Dos · Biceps · Arrière d'épaule", slots: ["hpull:1", "vpull:1", "hpull:2", "rear", "biceps", "biceps:1"], extra: ["carry"] },
    { name: "Jambes", focus: "Fessiers · Ischios · Mollets", slots: ["hinge:3", "squat:3", "glute", "quad", "hamstring:1", "calves"], extra: ["core:3"] },
  ],
};

const SCHEMES = {
  peak:   { compound: { sets: 4, reps: [5, 7],   rpe: 8.5, rest: 150 }, iso: { sets: 3, reps: [8, 12],  rpe: 9, rest: 75 } },
  full:   { compound: { sets: 4, reps: [6, 8],   rpe: 8,   rest: 135 }, iso: { sets: 3, reps: [10, 12], rpe: 8, rest: 75 } },
  normal: { compound: { sets: 3, reps: [8, 10],  rpe: 7,   rest: 120 }, iso: { sets: 3, reps: [10, 12], rpe: 7, rest: 60 } },
  light:  { compound: { sets: 2, reps: [10, 12], rpe: 6,   rest: 90 },  iso: { sets: 2, reps: [12, 15], rpe: 6, rest: 60 } },
};
const WARMUP_MIN = 7;

/** Bloc de 4 semaines : technique → volume → intensité → décharge. */
const BLOCK = [
  { n: 1, label: "Technique", sets: 0, rpe: -0.5 },
  { n: 2, label: "Volume", sets: 1, rpe: 0 },
  { n: 3, label: "Intensité", sets: 0, rpe: 0.5 },
  { n: 4, label: "Décharge", sets: -1, rpe: -1, deload: true },
];

export function blockWeek(profile, sessions = [], now = new Date()) {
  const today = dateKey(now);
  const start = profile.createdAt || today;
  const i = Math.floor(Math.max(0, daysBetween(start, today)) / 7) % 4;
  // Décharge inutile si les 3 dernières semaines ont été légères (reprise, vacances…)
  const recent = sessions.filter((s) => s.level !== "recovery" && daysBetween(s.date, today) <= 21).length;
  if (i === 3 && recent < trainDaysOf(profile).length * 2) return { n: 4, label: "Consolidation", sets: 0, rpe: 0 };
  return BLOCK[i];
}

export function splitFor(profile) {
  return SPLITS[Math.max(2, Math.min(5, trainDaysOf(profile).length))];
}

/** Prochain jour du cycle, d'après la dernière séance de musculation réalisée. */
export function nextDayIndex(profile, sessions) {
  const split = splitFor(profile);
  const last = sessions.find((s) => s.dayIndex != null && s.level !== "recovery");
  return last ? (last.dayIndex + 1) % split.length : 0;
}

/** Cycle de variantes : nouvelles variantes d'accessoires toutes les ~4 semaines. */
export function cycleOf(profile, sessions) {
  const lifted = sessions.filter((x) => x.level !== "recovery").length;
  return Math.floor(lifted / (splitFor(profile).length * 4));
}

const roundRpe = (r) => Math.round(r * 2) / 2;

/** Prescription d'un exercice pour un niveau donné (utilisée aussi pour remplacer un exercice). */
export function exerciseEntry(id, { level, profile, history = [], block = null, main = false }) {
  const ex = EXERCISES[id];
  const sch = SCHEMES[level === "recovery" ? "light" : level][ex.compound ? "compound" : "iso"];
  let sets = sch.sets;
  let rpe = sch.rpe;
  if (profile.level === "beginner") sets = Math.min(sets, 3);
  if (profile.level === "advanced" && ex.compound && level !== "light") sets += 1;
  if (block && level !== "light") {
    if (block.deload) sets = Math.max(2, Math.round(sets * 0.6));
    else if (ex.compound) sets += block.sets;
    rpe = roundRpe(Math.max(5, Math.min(9, rpe + block.rpe)));
  }
  const reps = ex.timed ? [30, 45] : sch.reps;
  const noLoad = ex.timed || ex.bw || profile.equip === "bw";
  const entry = {
    id, name: ex.name, cues: ex.cues, pattern: ex.pattern, muscles: ex.m, timed: !!ex.timed, bw: !!ex.bw, uni: !!ex.uni,
    compound: !!ex.compound, sets, reps, rpe, rest: sch.rest,
    suggested: noLoad ? null : suggestLoad(id, history, reps, rpe),
    hint: progressionHint(id, history, reps, noLoad),
  };
  // Jour « au top » : une série lourde (top set) puis des séries de travail à −10 %
  if (main && level === "peak" && !noLoad && !block?.deload) {
    entry.top = { reps: [3, 5], rpe: 9, suggested: suggestLoad(id, history, [3, 5], 9) };
  }
  return entry;
}

/** Durée estimée d'un exercice, en minutes (temps sous tension + repos). */
function exMinutes(e) {
  return (e.sets * ((e.timed ? e.reps[1] : 40) * (e.uni ? 2 : 1) + e.rest)) / 60;
}

/** Échauffement : 3 mouvements généraux + séries d'approche sur le premier exercice chargé. */
export function warmupFor(day, first) {
  const lower = ["squat", "hinge", "lunge"].includes(day.slots[0].split(":")[0]);
  const moves = lower
    ? [["bike_easy", "4 min"], ["bw_squat", "× 10"], ["walking_lunge", "× 5 / côté"]]
    : [["bike_easy", "4 min"], ["y_raise", "× 10"], ["pushup", "× 8"]];
  let ramp = [];
  const w = first?.top?.suggested || first?.suggested;
  if (w >= 30) ramp = [[0.5, 8], [0.7, 4], [0.85, 2]];
  else if (w >= 15) ramp = [[0.5, 8], [0.75, 3]];
  return { moves, ramp: ramp.map(([p, reps]) => ({ kg: Math.max(2.5, Math.round((w * p) / 2.5) * 2.5), reps })) };
}

/** Routine de récupération adaptée à l'état du jour. */
export function recoveryKind({ checkin, night, score }) {
  if ((checkin?.soreness ?? 0) >= 4) return "sore";
  if ((checkin?.energy ?? 3) <= 2 || (night && night.hours < 5.5) || score < 25) return "low";
  if (score >= 68) return "fresh";
  return "active";
}

/** Construit la séance du jour en respectant la durée choisie. */
export function buildSession({ profile, level, dayIndex, history, cycle = 0, workoutsToday = [], block = null, recovery = "active" }) {
  if (level === "recovery") {
    const r = RECOVERY[recovery] || RECOVERY.active;
    return {
      level, title: r.title, focus: r.focus, minutes: recovery === "fresh" ? 45 : 35, recovery: true, kind: recovery,
      items: r.items.map(([id, detail]) => ({ id, name: MOVES[id].name, detail })),
    };
  }

  const split = splitFor(profile);
  const day = split[dayIndex % split.length];
  const easy = level === "light";
  const budget = profile.duration || 60;
  const used = [];
  const exercises = [];
  let minutes = WARMUP_MIN;
  let letter = 0;

  // Séance légère : on garde l'essentiel ; sinon on ajoute les accessoires si le temps le permet
  const slots = easy ? day.slots.filter((p, i) => i < 4 || p.startsWith("core")) : [...day.slots, ...day.extra];
  slots.forEach((slot, i) => {
    const [pattern, off] = slot.split(":");
    // Les 3 premiers mouvements restent fixes pour mesurer le progrès ; les accessoires tournent
    const id = pickExercise(pattern, profile.equip, { easy, variant: Number(off || 0) + (i < 3 ? 0 : cycle), exclude: used });
    if (!id) return;
    const e = exerciseEntry(id, { level, profile, history, block, main: exercises.length === 0 });
    let cost = exMinutes(e);
    // Accessoires enchaînés en superset (deux exercices, un seul repos) pour tenir dans le temps
    const prev = exercises[exercises.length - 1];
    const pair = !easy && i >= 3 && !e.compound && prev && !prev.compound && !prev.ss && prev.sets === e.sets;
    if (pair) cost -= (prev.sets * (prev.rest - 15)) / 60;
    if (exercises.length >= 3 && minutes + cost > budget) return;
    if (pair) { prev.rest = 15; prev.ss = e.ss = "ABCD"[letter++]; }
    used.push(id);
    exercises.push(e);
    minutes += cost;
  });

  // Finisher cardio (utile pour la perte de gras), seulement s'il reste du temps
  const cardioToday = workoutsToday.filter((w) => !w.strength).reduce((t, w) => t + (w.minutes || 0), 0);
  const room = budget - minutes;
  let finisher = null;
  if (cardioToday < 20) {
    if ((level === "full" || level === "peak") && room >= 8) finisher = { id: "mountain_climber", name: "Intervalles", detail: "8 × 20 s vite / 40 s lent", minutes: 8 };
    else if (level === "normal" && room >= 10) { const m = Math.min(15, Math.floor(room / 5) * 5); finisher = { id: "bike_easy", name: "Cardio zone 2", detail: `${m} min, tu peux parler`, minutes: m }; }
    else if (level === "light" && room >= 10) { const m = Math.min(20, Math.floor(room / 5) * 5); finisher = { id: "walk", name: "Marche", detail: `${m} min tranquille`, minutes: m }; }
  }
  if (finisher) minutes += finisher.minutes;

  return {
    level, dayIndex: dayIndex % split.length, title: day.name, focus: day.focus, exercises, finisher, block,
    warmup: warmupFor(day, exercises[0]),
    minutes: Math.round(minutes), cardioDone: cardioToday >= 20 ? Math.round(cardioToday) : 0,
  };
}

/** Muscles sollicités par une liste d'exercices : principaux et secondaires. */
export function musclesOf(exercises) {
  const p = new Set(), s = new Set();
  for (const e of exercises) {
    const m = e.muscles || EXERCISES[e.id]?.m;
    if (!m) continue;
    m.p.forEach((x) => p.add(x));
    m.s.forEach((x) => s.add(x));
  }
  return { p: [...p], s: [...s].filter((x) => !p.has(x)) };
}

/** Séries par muscle sur les `days` derniers jours (principal = 1, secondaire = 0,5), normalisées 0–1. */
export function muscleVolume(sessions, days = 7, today = dateKey()) {
  const vol = {};
  for (const s of sessions) {
    if (daysBetween(s.date, today) >= days) continue;
    for (const e of s.exercises || []) {
      const m = EXERCISES[e.id]?.m;
      const n = e.sets.filter((x) => x.done).length;
      if (!m || !n) continue;
      m.p.forEach((k) => { vol[k] = (vol[k] || 0) + n; });
      m.s.forEach((k) => { vol[k] = (vol[k] || 0) + n / 2; });
    }
  }
  const heat = {};
  for (const [k, v] of Object.entries(vol)) heat[k] = Math.min(1, v / 12); // ~12 séries / semaine = bon volume
  return { sets: vol, heat };
}

// ───────────────────────── Charges

const RPE_OF_LEVEL = { peak: 8.5, full: 8, normal: 7, light: 6 };

/** 1RM estimé (Epley), en tenant compte des répétitions gardées en réserve (10 − RPE). */
export function e1rm(weight, reps, rpe = 8) {
  return weight * (1 + (reps + Math.max(0, 10 - rpe)) / 30);
}

/**
 * Charge conseillée : 1RM estimé sur la meilleure série des 3 dernières fois (une séance légère seule
 * ne fait donc pas chuter la charge), puis charge pour le bas de la fourchette du jour au RPE visé.
 * Pas de saut de plus de 10 % au-dessus de la plus lourde charge récente.
 */
export function suggestLoad(id, history, reps, rpe) {
  const perfs = recentPerformances(id, history, 3);
  const sets = perfs.flatMap((p) => p.sets
    .filter((s) => s.done && s.weight > 0 && s.reps > 0)
    .map((s) => ({ ...s, rpe: s.rpe ?? p.rpe ?? RPE_OF_LEVEL[p.level] ?? 7 })));
  if (!sets.length) return null;
  const best = Math.max(...sets.map((s) => e1rm(s.weight, s.reps, s.rpe)));
  const top = Math.max(...sets.map((s) => s.weight));
  const w = Math.min(best / (1 + (reps[0] + Math.max(0, 10 - rpe)) / 30), top * 1.1);
  return Math.round(w / 1.25) * 1.25 || null;
}

function recentPerformances(id, history, n) {
  const out = [];
  for (const s of history) {
    const ex = s.exercises?.find((e) => e.id === id && e.sets.some((x) => x.done));
    if (ex) out.push({ ...ex, level: s.level });
    if (out.length >= n) break;
  }
  return out;
}

/** Conseil de progression pour les exercices sans charge (poids du corps, gainage). */
export function progressionHint(id, history, reps, noLoad) {
  if (!noLoad) return null;
  const last = lastPerformance(id, history);
  if (!last) return null;
  const done = last.sets.filter((s) => s.done && s.reps > 0);
  if (!done.length || !done.every((s) => s.reps >= reps[1])) return null;
  return EXERCISES[id]?.timed ? "Objectif atteint : +5 à 10 s" : "Haut de fourchette atteint : descente en 4 s ou variante plus dure";
}

export function lastPerformance(id, history) {
  return recentPerformances(id, history, 1)[0] || null;
}

// ───────────────────────── Nutrition (recomposition)

/**
 * Besoins du jour. Utilise la dépense mesurée, les pas et la masse grasse de Google Health
 * quand elles existent, sinon la formule de Mifflin-St Jeor et des valeurs par défaut.
 */
export function nutrition(profile, { weights = [], daily = {}, today = dateKey() } = {}) {
  const w = weights[0]?.kg || profile.weight;
  const fatPct = weights.find((x) => x.fatPct != null)?.fatPct ?? null;
  const bmr = 10 * w + 6.25 * profile.height - 5 * profile.age + (profile.sex === "f" ? -161 : 5);
  const activity = trainDaysOf(profile).length >= 4 ? 1.55 : 1.45;

  const past = (n, key) => {
    const out = [];
    for (let i = 1; i <= n; i++) { const v = daily[addDays(today, -i)]?.[key]; if (v > 0) out.push(v); }
    return out;
  };
  const kcals = past(7, "kcal");
  const measured = kcals.length >= 4 ? mean(kcals) : null;
  const tdee = measured ?? bmr * activity;

  // Déficit ajusté à la tendance de poids (sur au moins 2 semaines de pesées)
  let deficit = 400;
  let trendPct = null;
  const recent = weights.filter((x) => daysBetween(x.date, today) <= 28);
  if (recent.length >= 3) {
    const span = daysBetween(recent[recent.length - 1].date, recent[0].date);
    if (span >= 14) {
      trendPct = ((recent[0].kg - recent[recent.length - 1].kg) / recent[recent.length - 1].kg) * 100 / (span / 7);
      if (trendPct < -1) deficit = 250;        // perte trop rapide : on protège le muscle
      else if (trendPct > 0.5) deficit = 500;  // prise trop rapide
    }
  }

  const steps = past(14, "steps");
  const stepTarget = steps.length >= 5 ? clamp(Math.round((mean(steps) + 1000) / 500) * 500, 6000, 12000) : 9000;

  return {
    tdee: Math.round(tdee / 10) * 10,
    target: Math.round((tdee - deficit) / 10) * 10,
    deficit,
    measured: measured != null,
    trendPct,
    // Masse grasse connue : protéines sur la masse maigre, sinon sur le poids total
    protein: fatPct != null ? Math.round(w * (1 - fatPct / 100) * 2.2) : Math.round(w * 1.8),
    steps: stepTarget,
    stepsToday: daily[today]?.steps ?? null,
  };
}

// ───────────────────────── Utilitaires

export function dateKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function addDays(key, n) {
  const d = new Date(key + "T12:00");
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 86400_000);
}

export function fmtHours(h) {
  if (h == null) return "–";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 60 ? `${hh + 1}h00` : `${hh}h${String(mm).padStart(2, "0")}`;
}

/** 8 240 → « 8,2k » */
export function fmtK(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k` : String(Math.round(n));
}
