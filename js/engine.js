// Moteur d'entraînement : sommeil + santé + ressenti → score de forme → séance adaptée.
// Toutes les données Google Health sont facultatives : sans elles, le score repose sur le sommeil
// (ou une nuit moyenne supposée) et le ressenti, comme avant.
import { EXERCISES, pickExercise, MOBILITY } from "./exercises.js";

export const INTENSITY = {
  full:     { key: "full",     label: "Pleine forme",  short: "Intense",   icon: "flame",   color: "var(--c-full)" },
  normal:   { key: "normal",   label: "En forme",      short: "Standard",  icon: "bolt",    color: "var(--c-normal)" },
  light:    { key: "light",    label: "Fatigué",       short: "Léger",     icon: "feather", color: "var(--c-light)" },
  recovery: { key: "recovery", label: "Récupération",  short: "Récup",     icon: "moon",    color: "var(--c-recovery)" },
};

export function levelOf(score) {
  return score >= 75 ? "full" : score >= 52 ? "normal" : score >= 32 ? "light" : "recovery";
}

const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

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

const LOAD_RPE = { full: 8, normal: 7, light: 5, recovery: 2 };

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

// ───────────────────────── Score de forme

/**
 * Score de forme du jour.
 * Sommeil 35 · VFC 25 · ressenti 20 · FC repos 10 · charge 10. Une donnée absente sort du calcul
 * et les autres sont repondérées. Garde-fous ensuite (maladie, dette de sommeil, surcharge…).
 */
export function readiness({ night, recentNights = [], checkin, profile, recentSessions = [], health = {}, workouts = [], today = dateKey() }) {
  const reasons = [];
  const metrics = {};
  const parts = [];

  const s = sleepScore(night, profile.sleepTarget);
  if (!s) reasons.push("Pas de données de sommeil : on part sur une nuit moyenne.");
  parts.push({ key: "sleep", w: 35, v: s ? s.score : 60 }); // inconnu : on suppose une nuit moyenne

  const energy = checkin?.energy ?? 3;      // 1 = vidé, 5 = au top
  const soreness = checkin?.soreness ?? 2;  // 1 = rien, 5 = très courbaturé
  parts.push({ key: "feel", w: 20, v: ((energy - 1) / 4) * 100 * 0.55 + ((5 - soreness) / 4) * 100 * 0.45 });

  const daily = health.daily || {};
  const hrv = versusBaseline(daily, "hrv", today, { log: true });
  if (hrv) {
    metrics.hrv = hrv;
    if (hrv.base != null) {
      parts.push({ key: "hrv", w: 25, v: clamp(55 + hrv.z * 20) });
      const pct = Math.round((hrv.value / hrv.base - 1) * 100);
      if (hrv.z <= -1) reasons.push(`VFC nettement sous ta moyenne (${pct} %) : récupération incomplète.`);
      else if (hrv.z >= 0.75) reasons.push(`VFC au-dessus de ta moyenne (+${pct} %) : bonne récupération.`);
    }
  }
  const rhr = versusBaseline(daily, "rhr", today);
  if (rhr) {
    metrics.rhr = rhr;
    if (rhr.base != null) {
      const delta = rhr.value - rhr.base;
      parts.push({ key: "rhr", w: 10, v: clamp(70 - delta * 6) });
      if (delta >= 5) reasons.push(`FC au repos haute (+${Math.round(delta)} bpm sur ta moyenne).`);
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
    reasons.push(`Signes possibles de maladie (${signals.join(", ")}) : repos aujourd'hui.`);
  } else if (rhr?.base != null && rhr.value - rhr.base >= 5) {
    const y = daily[addDays(today, -1)]?.rhr;
    if (y != null && y - rhr.base >= 5) {
      score = Math.min(score, 51);
      reasons.push("FC au repos haute deux matins de suite : on allège.");
    }
  }

  // Dette de sommeil sur 3 nuits, puis sur 7 nuits
  const last3 = recentNights.slice(0, 3).filter(Boolean);
  if (last3.length >= 2) {
    const avg = last3.reduce((a, n) => a + n.hours, 0) / last3.length;
    if (avg < 6) {
      score = Math.min(score, 62);
      reasons.push(`Dette de sommeil : ${fmtHours(avg)} en moyenne sur ${last3.length} nuits.`);
    }
  }
  const last7 = recentNights.slice(0, 7).filter(Boolean);
  if (last7.length >= 3) {
    const avg = last7.reduce((a, n) => a + n.hours, 0) / last7.length;
    if (avg < profile.sleepTarget - 1 && score >= 75) {
      score = 74;
      reasons.push(`Sommeil court cette semaine (${fmtHours(avg)} en moyenne) : pas de séance intense.`);
    }
  }
  if (night && night.hours < 5) reasons.push(`Nuit très courte (${fmtHours(night.hours)}).`);
  else if (night && night.hours < profile.sleepTarget - 1.5) reasons.push(`Nuit courte (${fmtHours(night.hours)} pour un objectif de ${fmtHours(profile.sleepTarget)}).`);
  if (soreness >= 4) reasons.push("Courbatures marquées : on allège le volume.");
  if (energy <= 2) reasons.push("Énergie basse ce matin.");

  // Surcharge : beaucoup plus d'entraînement cette semaine que d'habitude
  if (load?.ratio > 1.5) {
    score = Math.min(score, 51);
    reasons.push("Charge de la semaine bien au-dessus de ton habitude : on lève le pied.");
  }

  // Sport d'endurance la veille (course, vélo, foot…) : jambes à ménager
  const yesterday = addDays(today, -1);
  const legs = workouts.filter((w) => w.date === yesterday && w.legs).reduce((t, w) => t + (w.minutes || 0), 0);
  if (legs >= 45) {
    score = Math.min(score, 74);
    reasons.push(`${Math.round(legs)} min de sport hier (course, vélo…) : pas de séance intense.`);
  }

  // Trois jours d'affilée d'entraînement → on impose un jour plus calme
  const streak = consecutiveTrainingDays(recentSessions, today);
  if (streak >= 3) {
    score = Math.min(score, 45);
    reasons.push(`${streak} jours d'entraînement d'affilée : place à la récupération.`);
  }

  score = Math.round(clamp(score));
  const level = levelOf(score);
  if (!reasons.length) {
    reasons.push(level === "full" ? "Bonne nuit et bonne énergie : on peut pousser." : "Récupération correcte : séance standard.");
  }
  return { score, level, sleep: s, reasons, metrics, used: parts.map((p) => p.key) };
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
  return n >= 4 ? [1, 2, 4, 5] : [1, 3, 5];
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
  let reason = "Jour de repos prévu : marche et mobilité pour bien récupérer.";
  if (days.includes(now.getDay())) {
    kind = "train";
    reason = "";
    if (fullBody && gap < 2) {
      kind = "rest";
      reason = "Full body hier : 48 h de récupération avant le suivant. La séance est décalée à demain.";
    }
  } else if (doneBefore < plannedBefore && gap >= (fullBody ? 2 : 1)) {
    kind = "catchup";
    reason = "Séance manquée cette semaine : on la rattrape aujourd'hui.";
  }
  return { week, kind, reason, days };
}

// ───────────────────────── Programme

// Full body 3×/semaine (idéal pour recomposition) ou Haut/Bas 4×/semaine.
// `slots` : exercices par ordre de priorité ; `extra` : ajoutés seulement si la durée le permet.
const SPLITS = {
  3: [
    { name: "Full body A", focus: "Squat · Poussée · Tirage", slots: ["squat", "hpush", "vpull", "hinge", "arms", "core"], extra: ["calves", "rear"] },
    { name: "Full body B", focus: "Hinge · Épaules · Dos",    slots: ["hinge", "vpush", "hpull", "lunge", "arms", "core"], extra: ["hamstring", "calves"] },
    { name: "Full body C", focus: "Jambes · Pecs · Dos",      slots: ["lunge", "hpush", "hpull", "squat", "vpush", "core"], extra: ["rear", "arms"] },
  ],
  4: [
    { name: "Haut du corps 1", focus: "Pecs · Dos · Bras",          slots: ["hpush", "vpull", "vpush", "hpull", "arms", "arms"], extra: ["rear", "core"] },
    { name: "Bas du corps 1",  focus: "Quadriceps · Fessiers",      slots: ["squat", "hinge", "lunge", "hamstring", "calves", "core"], extra: [] },
    { name: "Haut du corps 2", focus: "Épaules · Dos · Pecs",       slots: ["vpush", "hpull", "hpush", "vpull", "arms", "core"], extra: ["rear", "arms"] },
    { name: "Bas du corps 2",  focus: "Ischios · Fessiers",         slots: ["hinge", "squat", "hamstring", "lunge", "calves", "core"], extra: [] },
  ],
};

const SCHEMES = {
  full:   { compound: { sets: 4, reps: [6, 8],   rpe: 8, rest: 150 }, iso: { sets: 3, reps: [10, 12], rpe: 8, rest: 75 } },
  normal: { compound: { sets: 3, reps: [8, 10],  rpe: 7, rest: 120 }, iso: { sets: 3, reps: [10, 12], rpe: 7, rest: 60 } },
  light:  { compound: { sets: 2, reps: [10, 12], rpe: 6, rest: 90 },  iso: { sets: 2, reps: [12, 15], rpe: 6, rest: 60 } },
};
const WARMUP_MIN = 8;

export function splitFor(profile) {
  return SPLITS[trainDaysOf(profile).length >= 4 ? 4 : 3];
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

/** Prescription d'un exercice pour un niveau donné (utilisée aussi pour remplacer un exercice). */
export function exerciseEntry(id, { level, profile, history = [] }) {
  const ex = EXERCISES[id];
  const sch = SCHEMES[level === "recovery" ? "light" : level][ex.compound ? "compound" : "iso"];
  let sets = sch.sets;
  if (profile.level === "beginner") sets = Math.min(sets, 3);
  if (profile.level === "advanced" && ex.compound && level !== "light") sets += 1;
  const reps = ex.timed ? [30, 45] : sch.reps;
  const noLoad = ex.timed || ex.bw || profile.equip === "bw";
  return {
    id, name: ex.name, cue: ex.cue, timed: !!ex.timed, bw: !!ex.bw,
    sets, reps, rpe: sch.rpe, rest: sch.rest,
    suggested: noLoad ? null : suggestLoad(id, history, reps, sch.rpe),
    hint: progressionHint(id, history, reps, noLoad),
  };
}

/** Durée estimée d'un exercice, en minutes (temps sous tension + repos). */
function exMinutes(e) {
  return (e.sets * ((e.timed ? e.reps[1] : 40) + e.rest)) / 60;
}

/** Construit la séance du jour en respectant la durée choisie. */
export function buildSession({ profile, level, dayIndex, history, cycle = 0, workoutsToday = [] }) {
  if (level === "recovery") {
    return {
      level, title: "Récupération active", focus: "Mobilité · Marche · Respiration",
      minutes: 40, recovery: true, items: MOBILITY,
      note: "Aujourd'hui, le meilleur entraînement c'est de récupérer. Bouger doucement favorise la récupération et les calories brûlées sans fatiguer ton système nerveux.",
    };
  }

  const split = splitFor(profile);
  const day = split[dayIndex % split.length];
  const easy = level === "light";
  const budget = profile.duration || 60;
  const used = [];
  const exercises = [];
  let minutes = WARMUP_MIN;

  // Séance légère : on garde l'essentiel ; sinon on ajoute les accessoires si le temps le permet
  const slots = easy ? day.slots.filter((p, i) => i < 4 || p === "core") : [...day.slots, ...day.extra];
  slots.forEach((pattern, i) => {
    // Les 3 premiers mouvements restent fixes pour mesurer le progrès ; les accessoires tournent
    const id = pickExercise(pattern, profile.equip, { easy, variant: i < 3 ? 0 : cycle, exclude: used });
    if (!id) return;
    const e = exerciseEntry(id, { level, profile, history });
    const m = exMinutes(e);
    if (exercises.length >= 3 && minutes + m > budget) return;
    used.push(id);
    exercises.push(e);
    minutes += m;
  });

  // Finisher cardio (utile pour la perte de gras), seulement s'il reste du temps
  const cardioToday = workoutsToday.filter((w) => !w.strength).reduce((t, w) => t + (w.minutes || 0), 0);
  const room = budget - minutes;
  let finisher = null;
  if (cardioToday < 20) {
    if (level === "full" && room >= 8) finisher = { name: "Finisher intervalles", detail: "8 rounds : 20 s effort / 40 s récup (vélo, rameur ou burpees)", minutes: 8 };
    else if (level === "normal" && room >= 10) { const m = Math.min(15, Math.floor(room / 5) * 5); finisher = { name: "Cardio zone 2", detail: `${m} min à allure où tu peux parler`, minutes: m }; }
    else if (level === "light" && room >= 10) { const m = Math.min(20, Math.floor(room / 5) * 5); finisher = { name: "Marche tranquille", detail: `${m} min, idéalement dehors`, minutes: m }; }
  }
  if (finisher) minutes += finisher.minutes;

  return {
    level, dayIndex: dayIndex % split.length, title: day.name, focus: day.focus, exercises, finisher,
    minutes: Math.round(minutes), cardioDone: cardioToday >= 20 ? Math.round(cardioToday) : 0,
    note: easy
      ? "Version allégée : charges réduites, moins de séries, aucune série à l'échec. Le but est de maintenir le stimulus sans creuser la fatigue."
      : level === "full"
        ? "Tu as bien récupéré : charges lourdes, garde 2 répétitions en réserve sur la dernière série."
        : "Séance standard : technique propre, 3 répétitions en réserve.",
  };
}

// ───────────────────────── Charges

const RPE_OF_LEVEL = { full: 8, normal: 7, light: 6 };

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
  return EXERCISES[id]?.timed
    ? "Objectif atteint la dernière fois : tiens 5 à 10 s de plus."
    : "Haut de fourchette atteint la dernière fois : ralentis la descente (4 s), ajoute un lest ou passe à une variante plus dure.";
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
