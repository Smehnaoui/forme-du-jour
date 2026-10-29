// Persistance locale (sur ton appareil uniquement).
import { GOOGLE_CLIENT_ID } from "./config.js";

const KEY = "forme.v1";

const DEFAULT = {
  profile: null,          // rempli à l'onboarding
  nights: {},             // { "YYYY-MM-DD": { hours, efficiency?, deepMin?, remMin?, quality?, source } }
  checkins: {},           // { "YYYY-MM-DD": { energy, soreness } }
  sessions: [],           // séances terminées, la plus récente en premier
  weights: [],            // [{ date, kg }]
  active: null,           // séance en cours
  override: {},           // { "YYYY-MM-DD": level } choix manuel d'intensité
  google: { clientId: GOOGLE_CLIENT_ID, connected: false, lastSync: null },
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? { ...structuredClone(DEFAULT), ...JSON.parse(raw) } : structuredClone(DEFAULT);
    s.google.clientId ||= GOOGLE_CLIENT_ID;
    return s;
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
  const data = JSON.parse(text);
  update((s) => Object.assign(s, structuredClone(DEFAULT), data));
}

export function reset() {
  update((s) => Object.assign(s, structuredClone(DEFAULT)));
}
