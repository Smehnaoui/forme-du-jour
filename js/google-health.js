// Connexion à la Google Health API (v4) : sommeil, récupération, activité, composition corporelle.
// Doc : https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
// Chaque donnée est lue séparément : si l'une manque (pas de montre, accès refusé, type non disponible),
// les autres sont quand même importées et l'app garde ses valeurs par défaut pour celle-là.
import { dateKey } from "./engine.js";

const AUTH = "https://www.googleapis.com/auth/googlehealth.";
export const SCOPES = {
  sleep: AUTH + "sleep.readonly",
  metrics: AUTH + "health_metrics_and_measurements.readonly",
  activity: AUTH + "activity_and_fitness.readonly",
};
// Adresse du compte : sert d'indice (login_hint) pour que Google ne redemande plus de choisir le compte.
const IDENTITY = "openid email";
const API = "https://health.googleapis.com/v4/users/me/dataTypes";
const TOKEN_KEY = "forme.gtoken";
const EMAIL_KEY = "forme.gemail";

/** Données lues et accès Google correspondant. */
export const SOURCES = {
  sleep:    { label: "Sommeil", scope: "sleep" },
  hrv:      { label: "Variabilité cardiaque (VFC)", scope: "metrics" },
  rhr:      { label: "FC au repos", scope: "metrics" },
  vitals:   { label: "Respiration, température, SpO₂", scope: "metrics" },
  body:     { label: "Poids et masse grasse", scope: "metrics" },
  steps:    { label: "Pas", scope: "activity" },
  energy:   { label: "Dépense énergétique", scope: "activity" },
  workouts: { label: "Séances de sport", scope: "activity" },
};

let tokenClient = null;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Précharge le script Google : la fenêtre s'ouvre alors directement au clic (pas de blocage de popup). */
export function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossible de charger Google Identity Services (hors ligne ?)."));
    document.head.appendChild(s);
  });
}

// Jeton gardé en localStorage (et non sessionStorage) pour survivre à la fermeture de l'app installée.
function readToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    return t && t.expires > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function hasToken() {
  return !!readToken();
}

/** Accès accordés lors de la dernière connexion (l'utilisateur peut en décocher certains). */
export function grantedScopes() {
  return (readToken()?.scope || "").split(" ").filter(Boolean);
}

/** Compte Google mémorisé à la première connexion (null avant). */
export function accountEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || null; } catch { return null; }
}

async function rememberEmail(token) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` } });
    const info = res.ok ? await res.json() : null;
    if (info?.email) localStorage.setItem(EMAIL_KEY, info.email);
  } catch { /* sans adresse, Google affichera simplement le choix du compte */ }
}

/**
 * Renvoie un jeton d'accès valide. Le jeton Google dure 1 h ; au-delà, on en redemande un en
 * indiquant le compte déjà utilisé : Google n'affiche alors ni le choix du compte ni le consentement
 * (la fenêtre s'ouvre et se referme seule). Le consentement complet n'est demandé qu'à la première connexion.
 */
export async function authorize(clientId, { force = false, first = false } = {}) {
  const cached = readToken();
  if (cached && !force) return cached.access_token;
  if (!clientId) throw new Error("Ajoute ton Client ID Google dans Profil → Google Health.");
  await loadGis();
  const hint = accountEmail();
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: [...Object.values(SCOPES), IDENTITY].join(" "),
      include_granted_scopes: true,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        try {
          localStorage.setItem(TOKEN_KEY, JSON.stringify({
            access_token: resp.access_token,
            expires: Date.now() + Number(resp.expires_in || 3600) * 1000,
            scope: resp.scope || SCOPES.sleep,
          }));
        } catch { /* ignore */ }
        if (!hint) rememberEmail(resp.access_token).finally(() => resolve(resp.access_token));
        else resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type === "popup_closed" ? "Connexion Google annulée." : err?.message || "Connexion Google annulée.")),
    });
    tokenClient.requestAccessToken(hint ? { prompt: "", login_hint: hint } : { prompt: first ? "consent" : "" });
  });
}

export function disconnect() {
  const t = readToken();
  clearToken();
  try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t.access_token, () => {});
}

// ───────────────────────── Appels à l'API

async function call(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (res.status === 401) {
    clearToken();
    throw new HttpError(401, "Session Google expirée, reconnecte-toi.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new HttpError(res.status, body?.error?.message || `Erreur Google Health (${res.status}).`);
  }
  return res.json();
}

async function pages(token, url, filter, pageSize, maxPages) {
  const out = [];
  let pageToken = "";
  let n = 0;
  do {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (filter) params.set("filter", filter);
    if (pageToken) params.set("pageToken", pageToken);
    const data = await call(token, `${url}?${params}`);
    out.push(...(data.dataPoints || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken && ++n < maxPages);
  return out;
}

/**
 * Points d'un type de donnée. `reconcile` fusionne les sources (montre + téléphone) ; en cas de refus,
 * on retombe sur `list`, puis sur `list` sans filtre (le tri par date est alors fait ici).
 */
async function points(token, type, filter, { pageSize = 25, maxPages = 10 } = {}) {
  let lastErr;
  for (const [suffix, f] of [[":reconcile", filter], ["", filter], ["", null]]) {
    try {
      return await pages(token, `${API}/${type}/dataPoints${suffix}`, f, pageSize, maxPages);
    } catch (e) {
      lastErr = e;
      if (e.status === 401 || e.status === 403) throw e;
    }
  }
  throw lastErr;
}

/** Cumul par jour civil (pas, calories…). */
async function dailyRollUp(token, type, days) {
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  const end = new Date();
  end.setDate(end.getDate() + 1);
  const civil = (d) => ({ date: { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() } });
  const data = await call(token, `${API}/${type}/dataPoints:dailyRollUp`, {
    method: "POST",
    body: JSON.stringify({ range: { start: civil(start), end: civil(end) }, windowSizeDays: 1, pageSize: days + 1 }),
  });
  return data.rollupDataPoints || [];
}

// ───────────────────────── Lecture des valeurs

const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const z2 = (n) => String(n).padStart(2, "0");
const civilKey = (d) => (d?.year ? `${d.year}-${z2(d.month)}-${z2(d.day)}` : null);
const sinceKey = (days) => dateKey(new Date(Date.now() - days * 86400_000));
const sinceIso = (days) => new Date(Date.now() - days * 86400_000).toISOString();

/** Premier nombre trouvé dans une valeur de cumul (les noms exacts varient : countSum, kcalSum…). */
function firstNumber(o) {
  if (o == null) return null;
  if (typeof o !== "object") return num(o);
  for (const v of Object.values(o)) {
    const x = firstNumber(v);
    if (x != null) return x;
  }
  return null;
}

function rollupKey(r) {
  return civilKey(r.civilStartTime?.date) || civilKey(r.civilStartTime);
}

async function fetchSleep(token, days = 14) {
  const list = await points(token, "sleep", `sleep.interval.end_time >= "${sinceIso(days)}"`);
  const nights = {};
  for (const dp of list) {
    const night = parseSleep(dp);
    if (!night || night.date < sinceKey(days)) continue;
    // Une seule nuit par date : on garde le sommeil principal / le plus long (pas les siestes)
    const prev = nights[night.date];
    if (!prev || night.main > prev.main || (night.main === prev.main && night.hours > prev.hours)) nights[night.date] = night;
  }
  for (const n of Object.values(nights)) delete n.main;
  return nights;
}

function parseSleep(dp) {
  const s = dp.sleep;
  if (!s?.interval?.endTime) return null;
  if (s.metadata?.nap) return null;

  const start = new Date(s.interval.startTime);
  const end = new Date(s.interval.endTime);
  const inBedMin = (end - start) / 60000;
  const sum = s.summary || {};

  const stageMin = (type) => {
    const fromSummary = sum.stagesSummary?.find((x) => x.type === type);
    if (fromSummary) return Number(fromSummary.minutes);
    if (!s.stages?.length) return null;
    return s.stages
      .filter((x) => x.type === type)
      .reduce((t, x) => t + (new Date(x.endTime) - new Date(x.startTime)) / 60000, 0);
  };

  let asleep = sum.minutesAsleep != null ? Number(sum.minutesAsleep) : null;
  if (asleep == null) {
    const awake = stageMin("AWAKE") ?? 0;
    asleep = inBedMin - awake;
  }
  if (!(asleep > 0)) return null;
  const deep = stageMin("DEEP");
  const rem = stageMin("REM");
  const hasStages = s.type === "STAGES" && deep != null && rem != null;

  return {
    date: dateKey(end),
    hours: Math.round((asleep / 60) * 100) / 100,
    efficiency: inBedMin > 0 ? Math.min(100, (asleep / inBedMin) * 100) : null,
    deepMin: hasStages ? deep : null,
    remMin: hasStages ? rem : null,
    bedtime: start.toISOString(),
    wake: end.toISOString(),
    source: "google",
    main: s.metadata?.mainSleep ? 1 : 0,
  };
}

/** Résumé quotidien (VFC, FC repos…) → { "YYYY-MM-DD": valeur }. */
async function fetchDailySummary(token, type, field, extract, days = 60) {
  const snake = type.replaceAll("-", "_");
  const list = await points(token, type, `${snake}.date >= "${sinceKey(days)}"`, { pageSize: 100, maxPages: 2 });
  const out = {};
  for (const dp of list) {
    const x = dp[field];
    const key = civilKey(x?.date);
    const v = x && extract(x);
    if (key && key >= sinceKey(days) && v != null && !(key in out)) out[key] = v;
  }
  return out;
}

async function fetchSteps(token, days = 30) {
  const out = {};
  try {
    for (const r of await dailyRollUp(token, "steps", days)) {
      const key = rollupKey(r);
      const v = firstNumber(r.steps);
      if (key && v != null) out[key] = v;
    }
    return out;
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw e;
  }
  // Repli : somme des intervalles bruts par jour
  const list = await points(token, "steps", `steps.interval.start_time >= "${sinceIso(days)}"`, { pageSize: 10000, maxPages: 3 });
  for (const dp of list) {
    const st = dp.steps;
    const c = num(st?.count);
    if (!st?.interval?.startTime || c == null) continue;
    const key = dateKey(new Date(st.interval.startTime));
    out[key] = (out[key] || 0) + c;
  }
  return out;
}

async function fetchEnergy(token, days = 14) {
  const out = {};
  for (const r of await dailyRollUp(token, "total-calories", days)) {
    const key = rollupKey(r);
    const v = firstNumber(r.totalCalories);
    if (key && v > 0 && key < dateKey()) out[key] = v; // journée en cours incomplète : ignorée
  }
  return out;
}

async function fetchBody(token, days = 60) {
  const byDate = {};
  const [wr, fr] = await Promise.allSettled([
    points(token, "weight", `weight.sample_time.physical_time >= "${sinceIso(days)}"`, { pageSize: 100, maxPages: 2 }),
    points(token, "body-fat", `body_fat.sample_time.physical_time >= "${sinceIso(days)}"`, { pageSize: 100, maxPages: 2 }),
  ]);
  if (wr.status === "rejected" && fr.status === "rejected") throw wr.reason;
  for (const dp of wr.value || []) {
    const g = num(dp.weight?.weightGrams);
    const t = dp.weight?.sampleTime?.physicalTime;
    if (!g || !t) continue;
    const key = dateKey(new Date(t));
    byDate[key] ||= { date: key, kg: Math.round(g / 100) / 10 };
  }
  for (const dp of fr.value || []) {
    const p = num(dp.bodyFat?.percentage);
    const t = dp.bodyFat?.sampleTime?.physicalTime;
    if (p == null || !t) continue;
    const key = dateKey(new Date(t));
    if (byDate[key] && byDate[key].fatPct == null) byDate[key].fatPct = Math.round(p * 10) / 10;
  }
  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}

const LEGS = /RUN|JOG|HIK|BIK|CYCL|SPIN|SOCCER|FOOT|BASKET|TENNIS|PADEL|SQUASH|SKI|SKAT|ELLIPTICAL|STAIR|ROW|WALK|TRAIL/;
const STRENGTH = /WEIGHT|STRENGTH/;

async function fetchWorkouts(token, days = 30) {
  const list = await points(token, "exercise", `exercise.interval.civil_start_time >= "${sinceKey(days)}"`, { pageSize: 25, maxPages: 4 });
  const out = [];
  for (const dp of list) {
    const x = dp.exercise;
    if (!x?.interval?.startTime) continue;
    const start = new Date(x.interval.startTime);
    const end = x.interval.endTime ? new Date(x.interval.endTime) : null;
    const active = parseFloat(x.activeDuration);
    const minutes = Math.round(active > 0 ? active / 60 : end ? (end - start) / 60000 : 0);
    if (!minutes) continue;
    const type = String(x.exerciseType || "");
    out.push({
      date: dateKey(start), start: start.toISOString(), minutes, type,
      name: x.displayName || type.toLowerCase().replaceAll("_", " ") || "Activité",
      strength: STRENGTH.test(type), legs: LEGS.test(type),
    });
  }
  return out.filter((w) => w.date >= sinceKey(days));
}

/** Respiration, écart de température et SpO₂ nocturnes, fusionnés par date. */
async function fetchVitals(token, days = 60) {
  const res = await Promise.allSettled([
    fetchDailySummary(token, "daily-respiratory-rate", "dailyRespiratoryRate", (x) => num(x.breathsPerMinute), days),
    fetchDailySummary(token, "daily-sleep-temperature-derivations", "dailySleepTemperatureDerivations", (x) => {
      const t = num(x.nightlyTemperatureCelsius), b = num(x.baselineTemperatureCelsius);
      return t != null && b != null ? Math.round((t - b) * 100) / 100 : null;
    }, days),
    fetchDailySummary(token, "daily-oxygen-saturation", "dailyOxygenSaturation", (x) => num(x.averagePercentage), days),
  ]);
  if (res.every((r) => r.status === "rejected")) throw res[0].reason;
  const out = {};
  ["resp", "tempDev", "spo2"].forEach((k, i) => {
    if (res[i].status !== "fulfilled") return;
    for (const [d, v] of Object.entries(res[i].value)) (out[d] ||= {})[k] = v;
  });
  return out;
}

/**
 * Synchronise tout ce qui est disponible. Ne lève une erreur que si rien n'a pu être lu
 * (session expirée, hors ligne…). `status` dit, pour chaque donnée : ok, empty, denied ou error.
 */
export async function fetchAll(clientId) {
  const token = readToken()?.access_token;
  if (!token) throw new HttpError(401, "Session Google expirée, appuie sur Synchroniser.");
  const granted = grantedScopes();
  const allowed = (k) => !granted.length || granted.includes(SCOPES[SOURCES[k].scope]);

  const jobs = {
    sleep: () => fetchSleep(token),
    hrv: () => fetchDailySummary(token, "daily-heart-rate-variability", "dailyHeartRateVariability",
      (x) => num(x.averageHeartRateVariabilityMilliseconds) ?? num(x.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)),
    rhr: () => fetchDailySummary(token, "daily-resting-heart-rate", "dailyRestingHeartRate", (x) => num(x.beatsPerMinute)),
    vitals: () => fetchVitals(token),
    body: () => fetchBody(token),
    steps: () => fetchSteps(token),
    energy: () => fetchEnergy(token),
    workouts: () => fetchWorkouts(token),
  };
  const keys = Object.keys(jobs).filter(allowed);
  const results = await Promise.allSettled(keys.map((k) => jobs[k]()));

  const status = {};
  const out = { nights: {}, daily: {}, weights: [], workouts: null, status };
  const daily = (d) => (out.daily[d] ||= {});
  const errors = [];

  keys.forEach((k, i) => {
    const r = results[i];
    if (r.status === "rejected") {
      status[k] = r.reason?.status === 403 ? "denied" : "error";
      errors.push(r.reason);
      return;
    }
    const v = r.value;
    const empty = Array.isArray(v) ? !v.length : !Object.keys(v).length;
    status[k] = empty ? "empty" : "ok";
    if (k === "sleep") out.nights = v;
    else if (k === "hrv" || k === "rhr") for (const [d, x] of Object.entries(v)) daily(d)[k] = x;
    else if (k === "steps") for (const [d, x] of Object.entries(v)) daily(d).steps = x;
    else if (k === "energy") for (const [d, x] of Object.entries(v)) daily(d).kcal = x;
    else if (k === "vitals") for (const [d, x] of Object.entries(v)) Object.assign(daily(d), x);
    else if (k === "body") out.weights = v;
    else if (k === "workouts") out.workouts = v;
  });
  for (const k of Object.keys(SOURCES)) if (!keys.includes(k)) status[k] = "denied";

  if (errors.length === keys.length) throw errors[0] || new Error("Google Health ne répond pas.");
  if (errors.some((e) => e?.status === 401)) throw errors.find((e) => e?.status === 401);
  return out;
}
