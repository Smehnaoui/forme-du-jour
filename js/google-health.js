// Connexion à la Google Health API (v4) pour lire le sommeil.
// Doc : https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list
import { dateKey } from "./engine.js";

const SCOPE = "https://www.googleapis.com/auth/googlehealth.sleep.readonly";
const API = "https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints";
const TOKEN_KEY = "forme.gtoken";

let tokenClient = null;

function loadGis() {
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

function savedToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
    return t && t.expires > Date.now() + 60_000 ? t.access_token : null;
  } catch {
    return null;
  }
}

export function hasToken() {
  return !!savedToken();
}

/** Ouvre la fenêtre de consentement Google et renvoie un jeton d'accès. */
export async function authorize(clientId, { silent = false } = {}) {
  const cached = savedToken();
  if (cached) return cached;
  if (!clientId) throw new Error("Ajoute ton Client ID Google dans Profil → Google Health.");
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
            access_token: resp.access_token,
            expires: Date.now() + Number(resp.expires_in || 3600) * 1000,
          }));
        } catch { /* ignore */ }
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || "Connexion Google annulée.")),
    });
    tokenClient.requestAccessToken({ prompt: silent ? "" : "consent" });
  });
}

export function disconnect() {
  const t = savedToken();
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
}

/** Récupère les nuits des `days` derniers jours, indexées par date de réveil. */
export async function fetchSleep(clientId, days = 14) {
  const token = await authorize(clientId, { silent: true });
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const nights = {};
  let pageToken = "";
  let guard = 0;

  do {
    const params = new URLSearchParams({
      filter: `sleep.interval.end_time >= "${since}"`,
      pageSize: "25",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${API}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 401) {
      try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      throw new Error("Session Google expirée, reconnecte-toi.");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Erreur Google Health (${res.status}).`);
    }
    const data = await res.json();
    for (const dp of data.dataPoints || []) {
      const night = parseSleep(dp);
      if (!night) continue;
      // Une seule nuit par date : on garde le sommeil principal / le plus long (pas les siestes)
      const prev = nights[night.date];
      if (!prev || night.main > prev.main || (night.main === prev.main && night.hours > prev.hours)) {
        nights[night.date] = night;
      }
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken && ++guard < 10);

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
