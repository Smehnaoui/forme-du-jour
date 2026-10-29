// Moteur d'entraînement : sommeil + ressenti → score de forme → séance adaptée.
import { EXERCISES, pickExercise, MOBILITY } from "./exercises.js";

export const INTENSITY = {
  full:     { key: "full",     label: "Pleine forme",  short: "Intense",   color: "var(--c-full)" },
  normal:   { key: "normal",   label: "En forme",      short: "Standard",  color: "var(--c-normal)" },
  light:    { key: "light",    label: "Fatigué",       short: "Léger",     color: "var(--c-light)" },
  recovery: { key: "recovery", label: "Récupération",  short: "Récup",     color: "var(--c-recovery)" },
};

// ───────────────────────── Score de sommeil

/** Note de sommeil 0–100 à partir d'une nuit. Renvoie aussi le détail lisible. */
export function sleepScore(night, targetHours = 7.5) {
  if (!night) return null;
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

/**
 * Score de forme du jour.
 * sleep 65 % · énergie ressentie 20 % · courbatures 15 %, puis garde-fous
 * (dette de sommeil, enchaînement de séances).
 */
export function readiness({ night, recentNights = [], checkin, profile, recentSessions = [] }) {
  const reasons = [];
  const s = sleepScore(night, profile.sleepTarget);
  const sleepPart = s ? s.score : 60; // inconnu : on suppose une nuit moyenne
  if (!s) reasons.push("Pas de données de sommeil : on part sur une nuit moyenne.");

  const energy = checkin?.energy ?? 3;      // 1 = vidé, 5 = au top
  const soreness = checkin?.soreness ?? 2;  // 1 = rien, 5 = très courbaturé
  let score = sleepPart * 0.65 + ((energy - 1) / 4) * 100 * 0.2 + ((5 - soreness) / 4) * 100 * 0.15;

  // Dette de sommeil sur 3 nuits
  const last3 = recentNights.slice(0, 3).filter(Boolean);
  if (last3.length >= 2) {
    const avg = last3.reduce((a, n) => a + n.hours, 0) / last3.length;
    if (avg < 6) {
      score = Math.min(score, 62);
      reasons.push(`Dette de sommeil : ${fmtHours(avg)} en moyenne sur ${last3.length} nuits.`);
    }
  }
  if (night && night.hours < 5) reasons.push(`Nuit très courte (${fmtHours(night.hours)}).`);
  else if (night && night.hours < profile.sleepTarget - 1.5) reasons.push(`Nuit courte (${fmtHours(night.hours)} pour un objectif de ${fmtHours(profile.sleepTarget)}).`);
  if (soreness >= 4) reasons.push("Courbatures marquées : on allège le volume.");
  if (energy <= 2) reasons.push("Énergie basse ce matin.");

  // Trois jours d'affilée d'entraînement → on impose un jour plus calme
  const streak = consecutiveTrainingDays(recentSessions);
  if (streak >= 3) {
    score = Math.min(score, 45);
    reasons.push(`${streak} jours d'entraînement d'affilée : place à la récupération.`);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  const level = score >= 75 ? "full" : score >= 52 ? "normal" : score >= 32 ? "light" : "recovery";
  if (!reasons.length) {
    reasons.push(level === "full" ? "Bonne nuit et bonne énergie : on peut pousser." : "Récupération correcte : séance standard.");
  }
  return { score, level, sleep: s, reasons };
}

function consecutiveTrainingDays(sessions) {
  const days = new Set(sessions.map((s) => s.date));
  let n = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (days.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ───────────────────────── Programme

// Full body 3×/semaine (idéal pour recomposition) ou Haut/Bas 4×/semaine.
const SPLITS = {
  3: [
    { name: "Full body A", focus: "Squat · Poussée · Tirage", slots: ["squat", "hpush", "vpull", "hinge", "arms", "core"] },
    { name: "Full body B", focus: "Hinge · Épaules · Dos",    slots: ["hinge", "vpush", "hpull", "lunge", "arms", "core"] },
    { name: "Full body C", focus: "Jambes · Pecs · Dos",      slots: ["lunge", "hpush", "hpull", "squat", "vpush", "core"] },
  ],
  4: [
    { name: "Haut du corps 1", focus: "Pecs · Dos · Bras",          slots: ["hpush", "vpull", "vpush", "hpull", "arms", "arms"] },
    { name: "Bas du corps 1",  focus: "Quadriceps · Fessiers",      slots: ["squat", "hinge", "lunge", "core"] },
    { name: "Haut du corps 2", focus: "Épaules · Dos · Pecs",       slots: ["vpush", "hpull", "hpush", "vpull", "arms", "core"] },
    { name: "Bas du corps 2",  focus: "Ischios · Fessiers",         slots: ["hinge", "squat", "lunge", "core"] },
  ],
};

const SCHEMES = {
  full:   { compound: { sets: 4, reps: [6, 8],   rpe: 8, rest: 150 }, iso: { sets: 3, reps: [10, 12], rpe: 8, rest: 75 }, loadFactor: 1 },
  normal: { compound: { sets: 3, reps: [8, 10],  rpe: 7, rest: 120 }, iso: { sets: 3, reps: [10, 12], rpe: 7, rest: 60 }, loadFactor: 1 },
  light:  { compound: { sets: 2, reps: [10, 12], rpe: 6, rest: 90 },  iso: { sets: 2, reps: [12, 15], rpe: 6, rest: 60 }, loadFactor: 0.8 },
};

export function splitFor(profile) {
  return SPLITS[profile.days >= 4 ? 4 : 3];
}

/** Prochain jour du cycle, d'après la dernière séance de musculation réalisée. */
export function nextDayIndex(profile, sessions) {
  const split = splitFor(profile);
  const last = sessions.find((s) => s.dayIndex != null && s.level !== "recovery");
  return last ? (last.dayIndex + 1) % split.length : 0;
}

/** Construit la séance du jour. */
export function buildSession({ profile, level, dayIndex, history, cycle = 0 }) {
  if (level === "recovery") {
    return {
      level, title: "Récupération active", focus: "Mobilité · Marche · Respiration",
      minutes: 40, recovery: true, items: MOBILITY,
      note: "Aujourd'hui, le meilleur entraînement c'est de récupérer. Bouger doucement favorise la récupération et les calories brûlées sans fatiguer ton système nerveux.",
    };
  }

  const split = splitFor(profile);
  const day = split[dayIndex % split.length];
  const scheme = SCHEMES[level];
  const easy = level === "light";
  const used = [];

  let slots = [...day.slots];
  // Séance légère : on garde l'essentiel (moins d'exercices)
  if (easy) slots = slots.filter((p, i) => i < 4 || p === "core");
  // Durée courte : on coupe les accessoires
  if (profile.duration <= 45) slots = slots.slice(0, Math.max(4, slots.length - 1));

  const exercises = slots.map((pattern) => {
    const id = pickExercise(pattern, profile.equip, { easy, variant: cycle, exclude: used });
    if (!id) return null;
    used.push(id);
    const ex = EXERCISES[id];
    const sch = ex.compound ? scheme.compound : scheme.iso;
    return {
      id, name: ex.name, cue: ex.cue, timed: !!ex.timed,
      sets: profile.level === "beginner" ? Math.min(sch.sets, 3) : sch.sets, reps: ex.timed ? [30, 45] : sch.reps, rpe: sch.rpe, rest: sch.rest,
      suggested: ex.timed || profile.equip === "bw" ? null : suggestLoad(id, history, sch.reps, scheme.loadFactor, ex.compound),
    };
  }).filter(Boolean);

  // Finisher cardio : utile pour la perte de gras
  const finisher =
    level === "full" ? { name: "Finisher intervalles", detail: "8 rounds : 20 s effort / 40 s récup (vélo, rameur ou burpees)" } :
    level === "normal" ? { name: "Cardio zone 2", detail: "15 min à allure où tu peux parler" } :
    { name: "Marche tranquille", detail: "20 min, idéalement dehors" };

  const minutes = Math.round(
    exercises.reduce((t, e) => t + e.sets * (45 + e.rest), 0) / 60 + (level === "full" ? 10 : level === "normal" ? 17 : 20) + 8
  );

  return {
    level, dayIndex: dayIndex % split.length, title: day.name, focus: day.focus, exercises, finisher, minutes,
    note: easy
      ? "Version allégée : charges −20 %, moins de séries, aucune série à l'échec. Le but est de maintenir le stimulus sans creuser la fatigue."
      : level === "full"
        ? "Tu as bien récupéré : charges lourdes, garde 2 répétitions en réserve sur la dernière série."
        : "Séance standard : technique propre, 3 répétitions en réserve.",
  };
}

/**
 * Double progression : si toutes les séries ont atteint le haut de la fourchette
 * la dernière fois, on monte la charge ; sinon on garde la même.
 */
export function suggestLoad(id, history, reps, loadFactor, compound) {
  const last = lastPerformance(id, history);
  if (!last) return null;
  const top = Math.max(...last.sets.map((s) => s.weight || 0));
  if (!top) return null;
  let w = top;
  const hitTop = last.sets.every((s) => s.done && s.reps >= last.repsTarget[1]);
  if (hitTop && last.level !== "light") w += compound ? 2.5 : 1;
  if (last.level === "light" && loadFactor === 1) w = w / 0.8; // retour à la normale après une séance légère
  w *= loadFactor;
  return Math.max(0, Math.round(w / 1.25) * 1.25);
}

export function lastPerformance(id, history) {
  for (const s of history) {
    const ex = s.exercises?.find((e) => e.id === id && e.sets.some((x) => x.done));
    if (ex) return { ...ex, level: s.level };
  }
  return null;
}

// ───────────────────────── Nutrition (recomposition)

export function nutrition(profile, latestWeight) {
  const w = latestWeight || profile.weight;
  const bmr = 10 * w + 6.25 * profile.height - 5 * profile.age + (profile.sex === "f" ? -161 : 5);
  const activity = profile.days >= 4 ? 1.55 : 1.45;
  const tdee = bmr * activity;
  return {
    tdee: Math.round(tdee / 10) * 10,
    target: Math.round((tdee - 400) / 10) * 10, // déficit modéré : on perd du gras sans sacrifier le muscle
    protein: Math.round(w * 1.8),
    steps: 9000,
  };
}

// ───────────────────────── Utilitaires

export function dateKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function fmtHours(h) {
  if (h == null) return "–";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 60 ? `${hh + 1}h00` : `${hh}h${String(mm).padStart(2, "0")}`;
}
