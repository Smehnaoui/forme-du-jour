// Persistance locale (sur ton appareil uniquement).
import { GOOGLE_CLIENT_ID } from "./config.js";

const KEY = "forme.v1";

const DEFAULT = {
  profile: null,          // rempli à l'onboarding
  nights: {},             // { "YYYY-MM-DD": { hours, efficiency?, deepMin?, remMin?, quality?, source } }
  checkins: {},           // { "YYYY-MM-DD": { energy, soreness } }
  sessions: [],           // séances terminées, la plus récente en premier
  weights: [],            // [{ date, kg, fatPct?, source? }], la plus récente en premier
  active: null,           // séance en cours
  override: {},           // { "YYYY-MM-DD": level } choix manuel d'intensité
  health: {               // données Google Health facultatives
    daily: {},            // { "YYYY-MM-DD": { hrv?, rhr?, resp?, tempDev?, spo2?, steps?, kcal? } }
    workouts: [],         // [{ date, minutes, type, name, strength, legs }]
  },
  google: { clientId: GOOGLE_CLIENT_ID, connected: false, lastSync: null, status: {} },
};

const PROFILE_BOUNDS = { age: [14, 90], height: [120, 230], weight: [30, 300] };

export function validProfileValue(field, v) {
  const b = PROFILE_BOUNDS[field];
  return !b || (Number.isFinite(v) && v >= b[0] && v <= b[1]);
}

const PROFILE_FALLBACK = { age: 30, height: 175, weight: 75 };

/**
 * Complète une sauvegarde (ancienne version ou import) avec les champs attendus.
 * `strict` (import) : lève une erreur si le profil est inutilisable ; sinon les valeurs aberrantes sont remplacées.
 */
function normalize(data, strict = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Format invalide");
  const s = { ...structuredClone(DEFAULT), ...data };
  for (const k of ["nights", "checkins", "override"]) if (!s[k] || typeof s[k] !== "object") s[k] = {};
  for (const k of ["sessions", "weights"]) if (!Array.isArray(s[k])) s[k] = [];
  s.health = { ...structuredClone(DEFAULT.health), ...(s.health || {}) };
  if (!Array.isArray(s.health.workouts)) s.health.workouts = [];
  s.google = { ...structuredClone(DEFAULT.google), ...(s.google || {}) };
  s.google.clientId ||= GOOGLE_CLIENT_ID;
  if (s.profile) {
    const p = s.profile;
    if (typeof p !== "object") throw new Error("Profil invalide");
    for (const f of Object.keys(PROFILE_BOUNDS)) {
      if (validProfileValue(f, Number(p[f]))) p[f] = Number(p[f]);
      else if (strict) throw new Error(`Profil invalide (${f})`);
      else p[f] = PROFILE_FALLBACK[f];
    }
    p.days = Number(p.days) || 3;
    p.duration = Number(p.duration) || 60;
    p.sleepTarget = Number(p.sleepTarget) || 7.5;
    p.equip ||= "gym";
    p.level ||= "intermediate";
  }
  return s;
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : structuredClone(DEFAULT);
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function get() {
  return state;
}

/** `silent` : sauvegarde sans notifier (évite de re-rendre pendant une saisie). */
export function update(fn, silent = false) {
  fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible (navigation privée) : on reste en mémoire */
  }
  listeners.forEach((l) => l(state, silent));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const data = normalize(JSON.parse(text), true); // lève une erreur avant de toucher aux données actuelles
  update((s) => Object.assign(s, data));
}

export function reset() {
  update((s) => Object.assign(s, structuredClone(DEFAULT)));
}
