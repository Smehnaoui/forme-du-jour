import * as store from "./store.js";
import {
  readiness, buildSession, nextDayIndex, splitFor, nutrition, sleepScore, cycleOf, blockWeek, recoveryKind,
  lastPerformance, exerciseEntry, weekPlan, trainDaysOf, musclesOf, muscleVolume,
  INTENSITY, THRESHOLDS, WEEKDAYS, dateKey, addDays, fmtHours, fmtK,
} from "./engine.js";
import { EXERCISES, MOVES, MUSCLES, GROUPS, alternativesFor } from "./exercises.js";
import { figure, startFigures, muscleMap } from "./figures.js";
import * as gh from "./google-health.js";

const $app = document.getElementById("app");
const $tabbar = document.getElementById("tabbar");
const $sheetRoot = document.getElementById("sheet-root");
const $toast = document.getElementById("toast");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kg = (w) => String(w).replace(".", ",");
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  clock: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  list: svg(`<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>`),
  bolt: svg(`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`),
  flame: svg(`<path d="M12 3c.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2.5-5 .3 1.8 1 2.8 2 3 .2-2.7-.3-5.3.5-8z"/>`),
  feather: svg(`<path d="M20 4C11 4 6 9 5 18l-2 3M9 14h6M12 10h6"/><path d="M20 4c0 8-4 13-11 14"/>`),
  rocket: svg(`<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 18l-3-3c1-4 4-9 12-12-3 8-8 11-12 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>`),
  moon: svg(`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`),
  check: svg(`<path d="m5 12 5 5L20 7"/>`),
  swap: svg(`<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>`),
  back: svg(`<path d="m15 18-6-6 6-6"/>`),
  chev: svg(`<path d="m9 6 6 6-6 6"/>`),
  close: svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
  sync: svg(`<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4"/>`),
  plus: svg(`<path d="M12 5v14M5 12h14"/>`),
  play: `<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>`,
  heart: svg(`<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>`),
  smile: svg(`<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>`),
  steps: svg(`<path d="M7 4c1.7 0 2.5 1.8 2.5 4S8.6 12 7 12s-2.5-1.8-2.5-4S5.3 4 7 4zM5 15h4v2a2 2 0 0 1-4 0zM17 8c1.7 0 2.5 1.8 2.5 4s-.9 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4zM15 19h4v1a2 2 0 0 1-4 0z"/>`),
  food: svg(`<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 0-3 2.5-3 6s1 4 3 4v8"/>`),
  egg: svg(`<path d="M12 3c3.5 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2.5-10 6-10z"/>`),
  info: svg(`<path d="M12 11v6M12 7.5h.01"/>`),
  sofa: svg(`<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM5 18v2M19 18v2"/>`),
  walk: svg(`<circle cx="13" cy="4" r="2"/><path d="m9 21 2-6 3 3v3M7 12l3-4 4 1 2 4 3 1M11 15l-1-5"/>`),
  hammer: svg(`<path d="m14 6 4 4M3 21l9-9M10 4l6-1 5 5-1 6-4-4-2 2-4-4 2-2z"/>`),
  grid: svg(`<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>`),
};
const lvlIcon = (level) => ICON[INTENSITY[level].icon];

function batteryIcon(n) {
  let bars = "";
  for (let i = 0; i < n; i++) bars += `<rect x="${4 + i * 3.2}" y="9" width="2.2" height="6" rx=".5" fill="currentColor" stroke="none"/>`;
  return svg(`<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/>${bars}`);
}
function barsIcon(n) {
  let out = "";
  for (let i = 0; i < 5; i++) {
    const h = 4 + i * 3.5;
    out += `<rect x="${2.5 + i * 4}" y="${20 - h}" width="2.8" height="${h}" rx="1" ${i < n ? `fill="currentColor" stroke="none"` : `opacity=".35"`}/>`;
  }
  return svg(out);
}

// ═════════════════════════ Routage

function route() {
  return (location.hash.replace(/^#\/?/, "") || "today").split("?")[0];
}

function render() {
  const s = store.get();
  leaveWorkoutIfNeeded();
  if (!s.profile) {
    $tabbar.classList.add("hidden");
    $app.classList.add("no-tabs");
    renderOnboarding();
    return startFigures($app);
  }
  let r = route();
  if (r === "workout" && !s.active) r = "today";
  const views = { today: viewToday, program: viewProgram, library: viewLibrary, progress: viewProgress, profile: viewProfile, workout: viewWorkout };
  const view = views[r] || viewToday;
  const tabs = r !== "workout";
  const tab = r === "library" ? "program" : r;
  $tabbar.classList.toggle("hidden", !tabs);
  $app.classList.toggle("no-tabs", !tabs);
  $tabbar.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.tab === tab);
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const live = liveBar(s, r);
  $app.classList.toggle("has-live", !!live);
  $app.innerHTML = view(s) + live;
  frenchSpaces($app);
  afterRender(r);
}

const clock = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h${String(Math.floor(sec / 60) % 60).padStart(2, "0")}` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);

/** Hors de l'écran de séance : rappel de la séance en cours, avec son chrono ou le repos qui tourne. */
function liveBar(s, r) {
  const a = s.active;
  if (!a || isStale(a) || r === "workout") return "";
  return `
    <button class="live-bar" data-action="resume" data-lvl="${a.level}">
      <span class="live-dot" aria-hidden="true"></span>
      <span class="grow"><b>Séance en cours</b><small>${esc(a.title)} · <span id="live-t">${liveText(a)}</span></small></span>
      <span class="live-go">Reprendre ${ICON.chev}</span>
    </button>`;
}
function liveText(a) {
  if (restTimer) return `repos ${clock(Math.max(0, Math.round((restEnd - Date.now()) / 1000)))}`;
  return clock(Math.floor((Date.now() - a.startedAt) / 1000));
}

function go(path) {
  const target = `#/${path}`;
  // Un panneau ouvert occupe une entrée d'historique : on la remplace, pour que « retour » ramène à l'écran d'avant
  const fromSheet = dropSheetEntry();
  if (location.hash === target) { if (fromSheet) history.back(); render(); }
  else if (fromSheet) location.replace(target);
  else location.hash = target;
  window.scrollTo({ top: 0 });
}

window.addEventListener("hashchange", () => { dropSheetEntry(); render(); window.scrollTo({ top: 0 }); });
// Geste ou bouton retour avec un panneau ouvert : on ferme le panneau au lieu de quitter l'écran
window.addEventListener("popstate", () => dropSheetEntry());

// ═════════════════════════ Calculs du jour

function recentNights(s, n = 7) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(s.nights[dateKey(d)] || null);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function readinessOf(s) {
  const today = dateKey();
  return readiness({
    night: s.nights[today] || null, recentNights: recentNights(s), checkin: s.checkins[today] || null,
    profile: s.profile, recentSessions: s.sessions, health: s.health, workouts: s.health.workouts, today,
  });
}

/** Niveau proposé sans choix manuel : récupération les jours de repos, sinon d'après l'énergie. */
function autoLevel(s, r = readinessOf(s), wp = weekPlan(s.profile, s.sessions, s.health.workouts)) {
  return wp.kind === "rest" ? "recovery" : r.level;
}

function todayPlan(s) {
  const today = dateKey();
  const night = s.nights[today] || null;
  const checkin = s.checkins[today] || null;
  const r = readinessOf(s);
  const wp = weekPlan(s.profile, s.sessions, s.health.workouts);
  const forced = s.override[today];
  const level = forced || autoLevel(s, r, wp);
  const block = blockWeek(s.profile, s.sessions);
  const session = buildSession({
    profile: s.profile, level, block,
    dayIndex: nextDayIndex(s.profile, s.sessions),
    history: s.sessions,
    cycle: cycleOf(s.profile, s.sessions),
    workoutsToday: s.health.workouts.filter((w) => w.date === today),
    recovery: recoveryKind({ checkin, night, score: r.score }),
  });
  const doneToday = s.sessions.find((x) => x.date === today);
  return { today, night, checkin, r, wp, level, session, block, doneToday, restDay: wp.kind === "rest" && !forced };
}

/** Séance ouverte depuis plus de 6 h sans activité : probablement oubliée. */
function isStale(a) {
  return a && Date.now() - (a.lastActivity || a.startedAt) > 6 * 3600_000;
}

const rxOf = (e) => `${e.sets}×${e.reps[0]}–${e.reps[1]}${e.timed ? " s" : ""}`;

// ═════════════════════════ Vue : Aujourd'hui

let ringFrom = null;   // score affiché au rendu précédent, pour animer la jauge depuis cette valeur
let ringScore = null;
let checkinOpen = false;
let syncing = false;

/** `estimated` : pas de nuit renseignée, le score repose sur une nuit moyenne supposée. */
function gauge(r, estimated) {
  const R = 80, C = 2 * Math.PI * R, L = C * 0.75;
  const arc = (frac, cls, extra = "") =>
    `<circle cx="100" cy="100" r="${R}" fill="none" stroke-width="14" stroke-linecap="round" class="${cls}" transform="rotate(135 100 100)" stroke-dasharray="${(L * frac).toFixed(1)} ${C.toFixed(1)}" ${extra}/>`;
  const from = ringFrom == null ? 0 : ringFrom / 100;
  ringScore = r.score;
  return `
    <div class="gauge ${estimated ? "estimated" : ""}" role="img" aria-label="Énergie du jour${estimated ? " estimée, sans ta nuit : environ" : " :"} ${r.score} sur 100">
      <svg viewBox="0 0 200 170" aria-hidden="true">
        ${arc(1, "track")}
        ${r.drain > 0 ? arc(r.morning / 100, "spent") : ""}
        ${arc(Math.max(0.005, from), "val", `data-to="${(L * Math.max(0.005, r.score / 100)).toFixed(1)} ${C.toFixed(1)}"`)}
      </svg>
      <div class="center" aria-hidden="true"><div><div class="score">${estimated ? `<span class="approx">≈</span>` : ""}${r.score}</div><div class="lbl">${estimated ? "ÉNERGIE ESTIMÉE" : "ÉNERGIE"}</div></div></div>
    </div>`;
}

const COMP_ICON = { sleep: ICON.moon, recovery: ICON.heart, feel: ICON.smile, day: ICON.steps };
function components(r) {
  return `<div class="comps">${r.components.map((c) => {
    const cls = c.value == null ? "" : c.value >= 70 ? "hi" : c.value >= 45 ? "" : c.value >= 25 ? "mid" : "lo";
    return `<button class="comp" data-action="why" aria-label="${c.label} : ${esc(c.text)}">
      <span class="ico">${COMP_ICON[c.key]}</span><div class="v">${esc(c.text)}</div><div class="k">${c.label}</div>
      <div class="bar"><i class="${cls}" style="width:${c.value ?? 0}%"></i></div></button>`;
  }).join("")}</div>`;
}

function viewToday(s) {
  const p = todayPlan(s);
  const { r, wp, level, session, night, checkin, doneToday, block } = p;
  const shown = INTENSITY[r.level];
  const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Salut" : "Bonsoir";
  const nut = nutrition(s.profile, { weights: s.weights, daily: s.health.daily });
  const stale = s.google.connected && !gh.hasToken();

  const top = r.reasons.slice(0, 2);
  const signals = `<div class="signals">${top.map((x) => `<button class="signal ${x.tone}" data-action="why"><i></i>${esc(x.text)}</button>`).join("")}
    ${r.reasons.length > 2 ? `<button class="signal more" data-action="why">+${r.reasons.length - 2}</button>` : ""}</div>`;

  const sleepCta = night ? "" : `
    <div class="hero-cta">
      ${s.google.clientId ? `<button class="btn white" data-action="sync">${ICON.sync} Nuit Google</button>` : ""}
      <button class="btn" data-action="edit-sleep" ${s.google.clientId ? "" : `style="grid-column:1/-1"`}>${ICON.moon} Saisir ma nuit</button>
    </div>`;

  const a = s.active;
  const staleBlock = isStale(a) ? `
    <section class="card stale-card">
      <div class="kicker">Séance restée ouverte</div>
      <h3 style="margin:4px 0 14px">${esc(a.title)} · ${new Date(a.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}</h3>
      <div class="grid-2">
        <button class="btn" data-action="cancel-workout">Supprimer</button>
        <button class="btn white" data-action="finish-stale">Enregistrer</button>
      </div>
    </section>` : "";

  return `
    <header class="top">
      <div><div class="date">${esc(dateStr)}</div><h1>${hello}${s.profile.name ? " " + esc(s.profile.name) : " !"}</h1></div>
      ${s.google.clientId ? `<button class="icon-btn ${syncing ? "spin" : ""}" data-action="sync" aria-label="Synchroniser Google Health">${ICON.sync}${stale ? `<span class="dot"></span>` : ""}</button>` : ""}
    </header>

    ${staleBlock}

    <section class="hero" data-lvl="${r.level}">
      ${gauge(r, !night)}
      <div class="hero-level"><span class="lvl-ico">${lvlIcon(r.level)}</span>${shown.label}</div>
      ${signals}
      ${components(r)}
      ${sleepCta}
    </section>

    ${checkinCard(checkin)}

    <div class="sec"><h2>${doneToday ? "Bravo" : p.restDay ? "Repos" : "Séance du jour"}</h2>${block && !session.recovery ? `<span class="tag">S${block.n} · ${block.label}</span>` : ""}</div>
    ${doneToday ? doneCard(doneToday, nut) : sessionCard(s, p)}

    <div class="sec"><h2>Ta semaine</h2></div>
    ${weekStrip(wp)}

    <div class="sec"><h2>Nutrition</h2><button class="link" data-action="nutri-info">Recomposition ${ICON.chev}</button></div>
    <section class="nutri">
      ${nutTile(ICON.food, nut.target.toLocaleString("fr-FR"), "kcal cible", null)}
      ${nutTile(ICON.egg, `${nut.protein} g`, "protéines", null)}
      ${nutTile(ICON.steps, nut.stepsToday != null ? fmtK(nut.stepsToday) : fmtK(nut.steps), nut.stepsToday != null ? `/ ${fmtK(nut.steps)} pas` : "pas", nut.stepsToday != null ? nut.stepsToday / nut.steps : null)}
    </section>
  `;
}

/** Anneau seulement quand il y a une progression à montrer ; sinon un simple repère, pas une jauge à 0 %. */
function nutTile(icon, v, k, frac) {
  const C = 2 * Math.PI * 24;
  const ring = frac != null ? `<svg viewBox="0 0 58 58" aria-hidden="true">
      <circle cx="29" cy="29" r="24" fill="none" stroke-width="5" class="t"/>
      <circle cx="29" cy="29" r="24" fill="none" stroke-width="5" class="p" stroke-dasharray="${(C * Math.min(1, frac)).toFixed(1)} ${C.toFixed(1)}"/>
    </svg>` : "";
  return `<div class="nut"><div class="ring ${frac != null ? "" : "none"}">${ring}<span class="ic">${icon}</span></div><div class="v">${v}</div><div class="k">${k}</div></div>`;
}

const DAY_OPTS = [[1, "Calme", ICON.sofa], [2, "Active", ICON.walk], [3, "Physique", ICON.hammer]];

function checkinCard(c) {
  c = c || {};
  const complete = c.energy && c.soreness && c.day;
  if (complete && !checkinOpen) {
    const day = DAY_OPTS.find(([v]) => v === c.day);
    return `<div class="sec"><h2>Ressenti</h2><button class="link" data-action="checkin-edit">Modifier</button></div>
      <section class="card ck-summary">
        <span class="tag">${batteryIcon(c.energy)} Énergie ${c.energy}/5</span>
        <span class="tag">${barsIcon(c.soreness)} Courbatures ${c.soreness}/5</span>
        <span class="tag">${day[2]} ${day[1]}</span>
      </section>`;
  }
  const scale = (key, icon, val) => [1, 2, 3, 4, 5].map((v) =>
    `<button class="chip" data-action="checkin" data-key="${key}" data-val="${v}" aria-pressed="${val === v}" aria-label="${key === "energy" ? "Énergie" : "Courbatures"} ${v} sur 5">${icon(v)}${v}</button>`).join("");
  return `
    <div class="sec"><h2>Ressenti</h2><span class="small muted">3 touches</span></div>
    <section class="card checkin">
      <div class="ck-row"><div class="ck-lbl"><span>Énergie</span><span>vidé → au top</span></div><div class="ck-scale">${scale("energy", batteryIcon, c.energy)}</div></div>
      <div class="ck-row"><div class="ck-lbl"><span>Courbatures</span><span>aucune → fortes</span></div><div class="ck-scale">${scale("soreness", barsIcon, c.soreness)}</div></div>
      <div class="ck-row"><div class="ck-lbl"><span>Ta journée</span><span>effort physique</span></div><div class="ck-scale three">
        ${DAY_OPTS.map(([v, l, ic]) => `<button class="chip" data-action="checkin" data-key="day" data-val="${v}" aria-pressed="${c.day === v}">${ic}${l}</button>`).join("")}
      </div></div>
    </section>`;
}

function tile(id, { name, rx, sub = "", ss = "", ei = "" } = {}) {
  return `<button class="tile" data-action="ex-info" data-id="${id}" ${ei !== "" ? `data-ei="${ei}"` : ""}>
    ${ss ? `<span class="ss">${ss}</span>` : ""}${figure(id, { ghost: true })}
    <span class="nm">${esc(name)}</span><span class="rx">${rx}${sub ? ` <small>${sub}</small>` : ""}</span></button>`;
}

function sessionCard(s, p) {
  const { session, level, wp } = p;
  const a = s.active;
  const planNote = p.restDay ? wp.reason : wp.kind === "catchup" && !s.override[p.today] ? wp.reason : "";
  const tiles = session.recovery
    ? session.items.map((it) => tile(it.id, { name: it.name, rx: esc(it.detail) })).join("")
    : session.exercises.map((e) => tile(e.id, {
        name: e.name, rx: rxOf(e), ss: e.ss ? `Superset ${e.ss}` : "",
        sub: e.top?.suggested ? `top ${kg(e.top.suggested)} kg` : e.suggested ? `${kg(e.suggested)} kg` : "",
      })).join("") + (session.finisher ? tile(session.finisher.id, { name: session.finisher.name, rx: esc(session.finisher.detail) }) : "");
  const m = session.recovery ? musclesOf(session.items.map((i) => ({ muscles: MOVES[i.id].m }))) : musclesOf(session.exercises);
  const names = (list) => list.slice(0, 4).map((k) => MUSCLES[k]).join(", ");
  return `
    <section class="card session" data-lvl="${level}">
      <div class="pad">
        <div class="session-top">
          <div class="grow"><div class="kicker">${esc(session.focus)}</div><h2>${esc(session.title)}</h2></div>
          <span class="tag lvl"><span class="lvl-ico">${lvlIcon(level)}</span>${INTENSITY[level].short}</span>
        </div>
        <div class="meta">
          <span class="tag">${ICON.clock} ${session.minutes} min</span>
          <span class="tag">${ICON.list} ${session.recovery ? session.items.length + " étapes" : session.exercises.length + " exercices"}</span>
          ${session.cardioDone ? `<span class="tag ok">${ICON.check} ${session.cardioDone} min de cardio déjà faites</span>` : ""}
        </div>
        ${planNote ? `<div class="plan-note">${esc(planNote)}</div>` : ""}
        ${m.p.length ? `<div class="session-muscles">${muscleMap(m)}<div class="names"><b>${esc(names(m.p))}</b>${m.s.length ? `<br>+ ${esc(names(m.s))}` : ""}</div></div>` : ""}
      </div>
      <div class="rail">${tiles}</div>
      <div class="actions">
        <button class="btn primary lg block" data-action="start">${ICON.play} ${a && !isStale(a) ? "Reprendre" : p.restDay ? "Lancer la récup" : "Commencer"}</button>
        <div class="adjust">
          <div class="segmented" role="group" aria-label="${p.restDay ? "S'entraîner quand même" : "Ajuster l'intensité"}">
            ${Object.values(INTENSITY).map((i) => `<button data-action="override" data-level="${i.key}" data-lvl="${i.key}" aria-pressed="${level === i.key}"><span class="lvl-ico">${lvlIcon(i.key)}</span>${i.short}</button>`).join("")}
          </div>
        </div>
      </div>
    </section>`;
}

function doneCard(d, nut) {
  return `
    <div class="card done-card" data-lvl="${d.level}">
      <div class="big">${ICON.check}</div>
      <h2>Séance faite</h2>
      <p class="muted small" style="margin:6px 0 14px">${esc(d.title)} · ${d.minutes} min${d.volume ? ` · ${Math.round(d.volume).toLocaleString("fr-FR")} kg` : ""}</p>
      <div class="tags" style="justify-content:center"><span class="tag">${ICON.egg} ${nut.protein} g de protéines</span><span class="tag">${ICON.moon} Coucher tôt</span></div>
    </div>`;
}

function weekStrip(wp) {
  const L = ["D", "L", "M", "M", "J", "V", "S"];
  const FULL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const TXT = { done: "séance faite", today: "aujourd'hui", missed: "séance manquée", planned: "séance prévue", rest: "repos" };
  return `
    <section class="week" aria-label="Ta semaine">
      ${wp.week.map((d) => `
        <div class="wd ${d.status}${d.planned ? " planned" : ""}${d.sport ? " sport" : ""}" aria-label="${FULL[d.wd]} : ${TXT[d.status]}${d.sport ? ", sport enregistré" : ""}">
          <span>${L[d.wd]}</span><i>${d.status === "done" ? ICON.check : ""}</i>
        </div>`).join("")}
    </section>`;
}

// ═════════════════════════ Vue : Séance en cours

function viewWorkout(s) {
  const a = s.active;
  const total = a.recovery ? a.items.length : a.exercises.reduce((t, e) => t + e.sets.length, 0);
  const done = a.recovery ? a.items.filter((i) => i.done).length : a.exercises.reduce((t, e) => t + e.sets.filter((x) => x.done).length, 0);

  // Exercice en cours (le seul animé) : celui de la dernière série validée s'il en reste, sinon le suivant non terminé
  const open = (e) => e.sets.some((x) => !x.done);
  const from = a.recovery ? 0 : a.exercises.findIndex((e, i) => i >= (a.focus ?? 0) && open(e));
  const cur = a.recovery ? a.items.findIndex((i) => !i.done) : from >= 0 ? from : a.exercises.findIndex(open);
  let body;
  if (a.recovery) {
    body = `<section class="card">${a.items.map((it, i) => `
      <div class="recovery-row ${it.done ? "is-done" : ""}">
        <button class="figbox" data-action="ex-info" data-id="${it.id}" aria-label="Voir ${esc(it.name)}">${figure(it.id, { animate: i === cur })}</button>
        <div class="grow"><div style="font-weight:800">${esc(it.name)}</div><div class="small muted">${esc(it.detail)}</div></div>
        <button class="check" data-action="toggle-item" data-i="${i}" aria-label="Valider ${esc(it.name)}" aria-pressed="${!!it.done}">${ICON.check}</button>
      </div>`).join("")}</section>`;
  } else {
    let lastSs = null;
    body = warmupCard(a) + a.exercises.map((e, ei) => {
      const label = e.ss && e.ss !== lastSs ? `<div class="ss-label">Superset ${e.ss} · enchaîne sans pause</div>` : !e.ss && lastSs ? `<div class="ss-label">Suite</div>` : "";
      lastSs = e.ss || null;
      return label + exerciseCard(s, e, ei, a, ei === cur);
    }).join("") + (a.finisher ? `
      <section class="card finisher">
        <div class="row">
          <div class="figbox" style="width:64px;height:64px;background:var(--surface-2);border-radius:14px;flex-shrink:0">${figure(a.finisher.id, { animate: cur < 0 && !a.finisherDone })}</div>
          <div class="grow"><div class="kicker">Bonus brûle-graisse</div><h3 style="margin-top:2px">${esc(a.finisher.name)}</h3><div class="small muted">${esc(a.finisher.detail)}</div></div>
          <button class="check ${a.finisherDone ? "on" : ""}" style="width:52px" data-action="toggle-finisher" aria-label="Valider le bonus" aria-pressed="${!!a.finisherDone}">${ICON.check}</button>
        </div>
      </section>` : "");
  }

  return `
    <div class="workout-head" data-lvl="${a.level}">
      <div class="row">
        <button class="icon-btn" data-action="leave-workout" aria-label="Retour">${ICON.back}</button>
        <div class="grow">
          <div class="kicker" style="color:var(--lvl)">${INTENSITY[a.level].label}</div>
          <h3>${esc(a.title)}</h3>
        </div>
        <div class="clock" id="elapsed">0:00</div>
      </div>
      <div class="progress-bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    </div>
    <div data-lvl="${a.level}" class="stack">${body}</div>
    <div class="bottom-action" data-lvl="${a.level}"><div class="inner">
      <button class="btn ghost" data-action="cancel-workout">Abandonner</button>
      <button class="btn primary grow" data-action="finish">Terminer</button>
    </div></div>
    <div class="rest-bar" id="rest-bar" aria-live="polite" data-lvl="${a.level}">
      ${!a.recovery && cur >= 0 ? restNext(a.exercises[cur]) : ""}
      <div class="rest-row">
        <div class="t" id="rest-t">0:00</div><div class="lbl">Repos</div>
        <button data-action="rest-add">+30 s</button><button data-action="rest-skip">Passer</button>
      </div>
      <i class="fill" id="rest-fill"></i>
    </div>`;
}

/** Pendant le repos : la prochaine série et le geste à refaire. */
function restNext(e) {
  const si = e.sets.findIndex((x) => !x.done);
  const x = e.sets[si], tgt = x.target || e.repsTarget;
  const load = x.weight ? ` · ${kg(x.weight)} kg` : e.bw ? " · poids du corps" : "";
  return `
    <div class="rest-next">
      <div class="rest-fig">${figure(e.id, { animate: true })}</div>
      <div class="grow">
        <div class="lbl">Ensuite · série ${si + 1}/${e.sets.length}</div>
        <div class="nx">${esc(e.name)}</div>
        <div class="nx-t">${tgt[0]}–${tgt[1]}${e.timed ? " s" : " reps"}${load}</div>
      </div>
    </div>`;
}

function warmupCard(a) {
  const w = a.warmup;
  if (!w) return "";
  const first = a.exercises[0];
  return `
    <details class="card warmup" ${a.exercises.some((e) => e.sets.some((x) => x.done)) ? "" : "open"}>
      <summary><div><div class="kicker">5 min</div><h3>Échauffement</h3></div><span class="link">${ICON.chev}</span></summary>
      <div class="wu-moves">${w.moves.map(([id, d]) => `<div class="wu">${figure(id)}${esc((EXERCISES[id] || MOVES[id]).name)}<br>${esc(d)}</div>`).join("")}</div>
      ${w.ramp.length ? `<div class="kicker" style="margin-top:14px">Séries d'approche · ${esc(first.name)}</div>
        <div class="ramp">${w.ramp.map((x) => `<span class="tag">${kg(x.kg)} kg × ${x.reps}</span>`).join("")}</div>` : ""}
    </details>`;
}

function exerciseCard(s, e, ei, a, current) {
  const exDone = e.sets.every((x) => x.done);
  const last = lastPerformance(e.id, s.sessions);
  const lastTxt = last ? last.sets.filter((x) => x.done).map((x) => `${x.weight ? kg(x.weight) : "PDC"}×${x.reps}`).join(" · ") : null;
  return `
    <section class="card ex-card ${exDone ? "done" : ""}" id="ex-${ei}">
      <div class="ex-head">
        <button class="figbox" data-action="ex-info" data-id="${e.id}" data-ei="${ei}" aria-label="Voir l'exécution de ${esc(e.name)}">${figure(e.id, { animate: current })}<span class="i">${ICON.info}</span></button>
        <div class="grow">
          <div class="kicker">${ei + 1}/${a.exercises.length}${e.uni ? " · par côté" : ""}</div>
          <h3>${esc(e.name)}</h3>
          <div class="target">${e.sets.length}×${e.repsTarget[0]}–${e.repsTarget[1]}${e.timed ? " s" : ""}<small>RPE ${String(e.rpe).replace(".", ",")}</small></div>
        </div>
        <button class="icon-btn sm" data-action="swap" data-ei="${ei}" aria-label="Changer d'exercice">${ICON.swap}</button>
      </div>
      ${e.hint ? `<div class="hint-line">${esc(e.hint)}</div>` : ""}
      <div class="sets">
        <div class="set-head"><span>#</span><span>${e.timed ? "—" : "Kg"}</span><span>${e.timed ? "Sec." : "Reps"}</span><button class="rpe-q" data-action="rpe-info" data-rpe="${e.rpe}" aria-label="RPE : l'effort ressenti, à quoi ça correspond ?">RPE<i aria-hidden="true">?</i></button><span></span></div>
        ${e.sets.map((x, si) => {
          const tgt = x.target || e.repsTarget;
          return `
          <div class="set-row ${x.done ? "is-done" : ""}">
            <span class="idx ${x.top ? "top" : ""}">${x.top ? "TOP" : si + 1}</span>
            <input type="number" inputmode="decimal" step="0.25" min="0" value="${x.weight ?? ""}" placeholder="${e.timed ? "—" : e.bw ? "PDC" : "kg"}" ${e.timed ? "disabled" : ""}
              data-field="weight" data-ei="${ei}" data-si="${si}" aria-label="Charge, série ${si + 1}, ${esc(e.name)}" />
            <input type="number" inputmode="numeric" min="0" value="${x.reps ?? ""}" placeholder="${tgt[0]}–${tgt[1]}"
              data-field="reps" data-ei="${ei}" data-si="${si}" aria-label="${e.timed ? "Secondes" : "Répétitions"}, série ${si + 1}, ${esc(e.name)}" />
            <input type="number" inputmode="decimal" step="0.5" min="5" max="10" value="${x.rpe ?? ""}" placeholder="${String(x.top ? 9 : e.rpe).replace(".", ",")}"
              data-field="rpe" data-ei="${ei}" data-si="${si}" aria-label="Effort ressenti (RPE), série ${si + 1}, ${esc(e.name)}" />
            <button class="check" data-action="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Valider la série ${si + 1}, ${esc(e.name)}" aria-pressed="${!!x.done}">${ICON.check}</button>
          </div>`;
        }).join("")}
      </div>
      <div class="ex-foot">
        <span class="last">${lastTxt ? `Dernière fois : ${lastTxt}` : "1re fois : garde 2–3 reps en réserve"}</span>
        <button class="link" data-action="add-set" data-ei="${ei}">${ICON.plus} Série</button>
      </div>
    </section>`;
}

// ═════════════════════════ Vue : Programme

function viewProgram(s) {
  const split = splitFor(s.profile);
  const next = nextDayIndex(s.profile, s.sessions);
  const cycle = cycleOf(s.profile, s.sessions);
  const block = blockWeek(s.profile, s.sessions);
  const days = trainDaysOf(s.profile);
  const equipName = { gym: "Salle", db: "Haltères", bw: "Poids du corps" }[s.profile.equip];
  const splitName = { 2: "Full body", 3: "Full body", 4: "Haut / Bas", 5: "Haut / Bas + PPL" }[split.length];
  const dayNames = [...days].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map((d) => WEEKDAYS[d]).join(" · ");
  const libIds = ["back_squat", "bench_press", "pullup"];
  return `
    <header class="top"><div><div class="date">${esc(dayNames)}</div><h1>Programme</h1></div></header>
    <div class="tags" style="margin-bottom:16px">
      <span class="tag">${days.length} séances / sem.</span><span class="tag">${splitName}</span><span class="tag">${equipName}</span><span class="tag">${s.profile.duration} min</span>
    </div>

    <div class="sec" style="margin-top:4px"><h2>Cycle de 4 semaines</h2></div>
    <section class="cycle">
      ${["Technique", "Volume", "Intensité", "Décharge"].map((l, i) => `<div class="wk ${block.n === i + 1 ? "cur" : ""}"><b>S${i + 1}</b><span>${block.n === i + 1 ? esc(block.label) : l}</span></div>`).join("")}
    </section>

    <div class="sec"><h2>Tes séances</h2><span class="small muted">version standard</span></div>
    ${split.map((day, i) => {
      const sess = buildSession({ profile: s.profile, level: "normal", dayIndex: i, history: s.sessions, cycle, block });
      return `
      <section class="card day-card ${i === next ? "next" : ""}" data-lvl="normal">
        <div class="pad row between" style="align-items:flex-start;margin-bottom:6px">
          <div class="grow"><div class="kicker">${i === next ? "Prochaine · " : ""}Jour ${i + 1} · ~${sess.minutes} min</div><h2 style="font-size:24px;margin-top:2px">${esc(day.name)}</h2></div>
          <div style="width:64px">${muscleMap(musclesOf(sess.exercises))}</div>
        </div>
        ${sess.exercises.map((e) => exRow(e.id, e.name, `${rxOf(e)}${e.ss ? ` · superset ${e.ss}` : ""}`)).join("")}
      </section>`;
    }).join("")}

    <div class="sec"><h2>Selon ton énergie</h2></div>
    ${levelScale()}

    <div class="sec"><h2>Bibliothèque</h2></div>
    <a class="cta-row" href="#/library">
      <div class="figs">${libIds.map((id) => figure(id)).join("")}</div>
      <div class="grow"><div style="font-weight:800">${Object.keys(EXERCISES).length} exercices illustrés</div><div class="small muted">Muscles, exécution, alternatives</div></div>
      <span class="link">${ICON.chev}</span>
    </a>`;
}

const LEVEL_TXT = {
  peak: "Top set lourd + séries à −10 %, intervalles",
  full: "4 × 6–8 · RPE 8 · intervalles",
  normal: "3 × 8–10 · RPE 7 · cardio zone 2",
  light: "2 × 12 · variantes guidées · marche",
  recovery: "Mobilité, marche, respiration",
};

function levelScale(current) {
  return `<section class="scale-lv">${THRESHOLDS.map(([k, min], i) => {
    const max = i ? THRESHOLDS[i - 1][1] - 1 : 100;
    return `<div class="lv ${current === k ? "cur" : ""}" data-lvl="${k}"><span class="lvl-ico">${lvlIcon(k)}</span>
      <div><b>${INTENSITY[k].label}</b><small>${LEVEL_TXT[k]}</small></div><span class="rng">${min}–${max}</span></div>`;
  }).join("")}</section>`;
}

function exRow(id, name, sub) {
  return `<button class="ex-row" data-action="ex-info" data-id="${id}">
    <span class="figbox">${figure(id)}</span>
    <span class="grow"><span class="nm">${esc(name)}</span><br><span class="sub">${sub}</span></span>
    <span class="chev">${ICON.chev}</span></button>`;
}

// ═════════════════════════ Vue : Bibliothèque

let libGroup = "all";
let libMine = true;

function viewLibrary(s) {
  const ids = Object.keys(EXERCISES).filter((id) => {
    const ex = EXERCISES[id];
    if (libMine && !ex.equip.includes(s.profile.equip)) return false;
    return libGroup === "all" || GROUPS[libGroup].patterns.includes(ex.pattern);
  });
  return `
    <header class="top"><div class="row"><a class="icon-btn" href="#/program" aria-label="Retour">${ICON.back}</a><div><div class="date">${ids.length} exercices</div><h1>Bibliothèque</h1></div></div></header>
    <div class="filters" role="group" aria-label="Filtrer">
      <button class="chip" data-action="lib-mine" aria-pressed="${libMine}">Mon matériel</button>
      <button class="chip" data-action="lib-group" data-g="all" aria-pressed="${libGroup === "all"}">Tous</button>
      ${Object.entries(GROUPS).map(([k, g]) => `<button class="chip" data-action="lib-group" data-g="${k}" aria-pressed="${libGroup === k}">${g.label}</button>`).join("")}
    </div>
    <section class="lib" data-lvl="normal">
      ${ids.map((id) => tile(id, { name: EXERCISES[id].name, rx: "", sub: EXERCISES[id].m.p.map((m) => MUSCLES[m]).join(" · ") })).join("")}
    </section>`;
}

// ═════════════════════════ Vue : Progrès

function viewProgress(s) {
  const weekAgo = dateKey(new Date(Date.now() - 6 * 86400_000));
  const lifted = s.sessions.filter((x) => x.level !== "recovery");
  const thisWeek = lifted.filter((x) => x.date >= weekAgo).length;
  const w = s.weights;
  const delta = w.length > 1 ? w[0].kg - w[w.length - 1].kg : null;
  const fat = w.find((x) => x.fatPct != null);
  const sports = s.health.workouts.filter((x) => !x.strength && x.date >= dateKey(new Date(Date.now() - 13 * 86400_000)));
  const vol = muscleVolume(s.sessions, 7);
  const ranked = Object.entries(vol.sets).sort((x, y) => y[1] - x[1]).slice(0, 6);

  return `
    <header class="top"><div><div class="date">Ton évolution</div><h1>Progrès</h1></div></header>
    <section class="stats">
      <div class="stat"><div class="v">${thisWeek}/${trainDaysOf(s.profile).length}</div><div class="k">séances (7 j)</div></div>
      <div class="stat"><div class="v">${lifted.length}</div><div class="k">au total</div></div>
      <div class="stat"><div class="v">${delta == null ? "–" : (delta > 0 ? "+" : "") + delta.toFixed(1).replace(".", ",")}</div><div class="k">kg depuis le début</div></div>
    </section>

    <div class="sec"><h2>Muscles · 7 jours</h2><span class="small muted">séries</span></div>
    <section class="card" data-lvl="full">
      ${ranked.length ? `<div class="heat">${muscleMap({ heat: vol.heat })}<div class="heat-list">${ranked.map(([k, v]) => `<div class="hl"><span>${MUSCLES[k]}</span><span>${Math.round(v)}</span></div>`).join("")}</div></div>
        <div class="legend"><span><i style="background:color-mix(in srgb,var(--lvl) 22%,#30353d)"></i>Peu</span><span><i style="background:color-mix(in srgb,var(--lvl) 45%,#30353d)"></i>Moyen</span><span><i style="background:var(--lvl)"></i>~12 séries+</span></div>`
        : `<p class="muted small" style="margin:0">Tes muscles travaillés apparaîtront ici après ta première séance.</p>`}
    </section>

    <div class="sec"><h2>Poids</h2><button class="link" data-action="add-weight">${ICON.plus} Pesée</button></div>
    <section class="card">
      ${w.length >= 2 ? weightChart(w) : `<p class="muted small" style="margin:0">Pèse-toi le matin à jeun, 2–3 fois par semaine.${w.length ? ` Dernière pesée : <strong>${kg(w[0].kg)} kg</strong>.` : ""}</p>`}
      ${fat ? `<div class="grid-2" style="margin-top:14px">
        <div class="stat"><div class="v">${kg(fat.fatPct)} %</div><div class="k">masse grasse</div></div>
        <div class="stat"><div class="v">${(fat.kg * (1 - fat.fatPct / 100)).toFixed(1).replace(".", ",")}</div><div class="k">kg de masse maigre</div></div>
      </div>` : ""}
    </section>

    <div class="sec"><h2>Sommeil · 14 nuits</h2><span class="small muted">objectif ${fmtHours(s.profile.sleepTarget)}</span></div>
    <section class="card">${sleepChart(s)}</section>

    ${sports.length ? `
      <div class="sec"><h2>Autres sports</h2><span class="small muted">14 jours</span></div>
      <section class="card">${sports.map((x) => `
        <div class="history-item"><div class="badge" data-lvl="normal"><b>${new Date(x.date + "T12:00").getDate()}</b></div>
          <div class="grow"><div style="font-weight:800;text-transform:capitalize">${esc(x.name)}</div><div class="small muted">${x.minutes} min</div></div></div>`).join("")}
      </section>` : ""}

    <div class="sec"><h2>Historique</h2></div>
    <section class="card">
      ${s.sessions.length ? s.sessions.slice(0, 30).map((x, i) => {
        const d = new Date(x.date + "T12:00");
        return `
        <button class="history-item" data-action="history" data-i="${i}" data-lvl="${INTENSITY[x.level] ? x.level : "normal"}">
          <div class="badge"><b>${d.getDate()}</b><small>${d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</small></div>
          <div class="grow">
            <div style="font-weight:800">${esc(x.title)}</div>
            <div class="small muted">${INTENSITY[x.level]?.short || ""} · ${x.minutes} min${x.volume ? ` · ${Math.round(x.volume).toLocaleString("fr-FR")} kg` : ""}</div>
          </div>
          <span class="chev">${ICON.chev}</span>
        </button>`;
      }).join("") : `<p class="muted small" style="margin:0">Tes séances terminées apparaîtront ici.</p>`}
    </section>`;
}

function weightChart(weights) {
  const pts = [...weights].reverse().slice(-30);
  const W = 320, H = 140, P = 24;
  const ys = pts.map((p) => p.kg);
  const min = Math.floor(Math.min(...ys) - 0.5), max = Math.ceil(Math.max(...ys) + 0.5);
  const x = (i) => P + (i * (W - P * 2)) / Math.max(1, pts.length - 1);
  const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - P * 2);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du poids">
      <text x="0" y="${y(max) + 4}">${max}</text><text x="0" y="${y(min) + 4}">${min}</text>
      <line x1="${P}" x2="${W - P}" y1="${y(min)}" y2="${y(min)}" stroke="var(--line)"/>
      <path d="${d} L${x(pts.length - 1)},${y(min)} L${x(0)},${y(min)} Z" fill="var(--text)" opacity=".06"/>
      <path d="${d}" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.kg)}" r="3.5" fill="var(--bg)" stroke="var(--text)" stroke-width="2"><title>${p.date} : ${p.kg} kg</title></circle>`).join("")}
      <text x="${x(pts.length - 1)}" y="${y(pts[pts.length - 1].kg) - 10}" text-anchor="end" style="fill:var(--text);font-size:12px;font-weight:800">${kg(pts[pts.length - 1].kg)} kg</text>
    </svg>`;
}

function sleepChart(s) {
  const days = [];
  const d = new Date();
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    days.push({ key: dateKey(dd), label: dd.toLocaleDateString("fr-FR", { weekday: "narrow" }), night: s.nights[dateKey(dd)] });
  }
  if (!days.some((x) => x.night)) return `<p class="muted small" style="margin:0">Aucune nuit enregistrée. Connecte Google Health ou saisis ta nuit depuis Aujourd'hui.</p>`;
  const W = 320, H = 150, P = 20, maxH = 10;
  const bw = (W - P) / 14;
  const y = (h) => H - P - (Math.min(h, maxH) / maxH) * (H - P - 8);
  const color = (n) => { const sc = sleepScore(n, s.profile.sleepTarget)?.score ?? 0; return sc >= 80 ? "full" : sc >= 60 ? "normal" : sc >= 40 ? "light" : "recovery"; };
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Durée de sommeil sur 14 nuits">
      <line x1="${P}" x2="${W}" y1="${y(s.profile.sleepTarget)}" y2="${y(s.profile.sleepTarget)}" stroke="var(--muted)" stroke-dasharray="3 4"/>
      <text x="0" y="${y(s.profile.sleepTarget) + 3}">${fmtHours(s.profile.sleepTarget)}</text>
      ${days.map((x, i) => {
        const cx = P + i * bw + 3;
        const bar = x.night ? `<rect x="${cx}" y="${y(x.night.hours)}" width="${bw - 6}" height="${H - P - y(x.night.hours)}" rx="4" fill="var(--c-${color(x.night)})"><title>${x.key} : ${fmtHours(x.night.hours)}</title></rect>`
          : `<rect x="${cx}" y="${H - P - 3}" width="${bw - 6}" height="3" rx="1.5" fill="var(--surface-3)"/>`;
        return `${bar}<text x="${cx + (bw - 6) / 2}" y="${H - 4}" text-anchor="middle">${x.label}</text>`;
      }).join("")}
    </svg>
    <div class="legend">
      <span><i style="background:var(--c-full)"></i>Excellente</span><span><i style="background:var(--c-normal)"></i>Bonne</span>
      <span><i style="background:var(--c-light)"></i>Moyenne</span><span><i style="background:var(--c-recovery)"></i>Mauvaise</span>
    </div>`;
}

// ═════════════════════════ Vue : Profil

const SOURCE_STATUS = { ok: ["Reçu", "ok"], empty: ["Aucune donnée", ""], denied: ["Accès non accordé", ""], error: ["Indisponible", "warn"] };

function dayChips(selected, action) {
  return `<div class="day-chips" role="group" aria-label="Jours d'entraînement">${[1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<button class="chip" data-action="${action}" data-day="${d}" aria-pressed="${selected.includes(d)}" aria-label="${WEEKDAYS[d]}">${WEEKDAYS[d].slice(0, 2)}</button>`).join("")}</div>`;
}

function viewProfile(s) {
  const p = s.profile;
  const g = s.google;
  const seg = (field, opts, val) => `<div class="segmented">${opts.map(([v, l]) => `<button data-action="set-profile" data-field="${field}" data-val="${v}" aria-pressed="${String(val) === String(v)}">${l}</button>`).join("")}</div>`;
  const days = trainDaysOf(p);
  const email = gh.accountEmail();
  return `
    <header class="top"><div><div class="date">Réglages</div><h1>Profil</h1></div></header>

    <section class="card">
      <div class="field"><label for="pf-name">Prénom</label><input class="input" id="pf-name" data-profile="name" maxlength="40" value="${esc(p.name)}" /></div>
      <div class="grid-3 field-grid">
        <div class="field"><label for="pf-age">Âge</label><input class="input" id="pf-age" type="number" inputmode="numeric" min="14" max="90" data-profile="age" value="${p.age}" /></div>
        <div class="field"><label for="pf-h">Taille (cm)</label><input class="input" id="pf-h" type="number" inputmode="numeric" min="120" max="230" data-profile="height" value="${p.height}" /></div>
        <div class="field"><label for="pf-w">Poids (kg)</label><input class="input" id="pf-w" type="number" inputmode="decimal" step="0.1" min="30" max="300" data-profile="weight" value="${p.weight}" /></div>
      </div>
      <div class="field"><span class="label">Sexe</span>${seg("sex", [["m", "Homme"], ["f", "Femme"]], p.sex)}</div>
      <div class="field"><span class="label">Niveau</span>${seg("level", [["beginner", "Débutant"], ["intermediate", "Intermédiaire"], ["advanced", "Confirmé"]], p.level)}</div>
      <div class="field"><span class="label">Jours d'entraînement · ${days.length} / semaine</span>${dayChips(days, "toggle-day")}</div>
      <div class="field"><span class="label">Durée</span>${seg("duration", [[45, "45 min"], [60, "60 min"], [75, "75 min"]], p.duration)}</div>
      <div class="field"><span class="label">Équipement</span>${seg("equip", [["gym", "Salle"], ["db", "Haltères"], ["bw", "Aucun"]], p.equip)}</div>
      <div class="field"><span class="label">Objectif de sommeil</span>${seg("sleepTarget", [[7, "7h"], [7.5, "7h30"], [8, "8h"], [8.5, "8h30"]], p.sleepTarget)}</div>
    </section>

    <div class="sec"><h2>Google Health</h2><span class="tag ${g.connected ? "ok" : ""}">${g.connected ? "Connecté" : "Non connecté"}</span></div>
    <section class="card stack">
      ${g.connected && email ? `<div class="account"><div class="av">${esc(email[0].toUpperCase())}</div><div class="grow"><div style="font-weight:800">${esc(email)}</div><div class="small muted">Compte retenu : plus besoin de le choisir</div></div></div>` : ""}
      ${!g.connected ? `<p class="small muted" style="margin:0">Sommeil, VFC, FC repos, pas, sport, poids. Lecture seule, données gardées sur ton téléphone.</p>` : ""}
      ${g.connected && Object.keys(g.status || {}).length ? `
        <ul class="sources">${Object.entries(gh.SOURCES).map(([k, src]) => {
          const [txt, cls] = SOURCE_STATUS[g.status[k]] || ["Pas encore lu", ""];
          return `<li><span>${esc(src.label)}</span><span class="src ${cls}">${txt}</span></li>`;
        }).join("")}</ul>` : ""}
      ${g.lastSync ? `<div class="small muted">Dernière synchro : ${new Date(g.lastSync).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>` : ""}
      <div class="${g.connected ? "grid-2" : ""}">
        <button class="btn white ${g.connected ? "" : "block"}" data-action="sync">${ICON.sync} ${g.connected ? "Synchroniser" : "Connecter"}</button>
        ${g.connected ? `<button class="btn ghost" data-action="disconnect">Déconnecter</button>` : ""}
      </div>
      <details class="small muted"><summary>Réglages avancés</summary>
        <div class="field" style="margin-top:12px"><label for="g-client">Client ID OAuth Google</label><input class="input" id="g-client" placeholder="xxxx.apps.googleusercontent.com" value="${esc(g.clientId)}" autocomplete="off" spellcheck="false" /></div>
        <ol style="padding-left:18px;margin:12px 0 0">
          <li>console.cloud.google.com : crée un projet, active la <strong>Google Health API</strong>.</li>
          <li>Écran de consentement « Externe », ton Gmail en utilisateur test, accès <code>googlehealth.sleep.readonly</code>, <code>googlehealth.health_metrics_and_measurements.readonly</code>, <code>googlehealth.activity_and_fitness.readonly</code>.</li>
          <li>ID client OAuth « Application Web », origine : <code>${esc(location.origin)}</code>.</li>
        </ol>
      </details>
    </section>

    <div class="sec"><h2>Données</h2></div>
    <section class="card grid-2">
      <button class="btn" data-action="export">Exporter</button>
      <label class="btn" style="cursor:pointer">Importer<input type="file" accept="application/json" id="import-file" hidden /></label>
      <button class="btn danger" data-action="reset" style="grid-column:1/-1">Tout effacer</button>
    </section>`;
}

// ═════════════════════════ Accueil

const onb = { step: 0, data: { name: "", sex: "m", age: 30, height: 178, weight: 82, level: "intermediate", days: 3, trainDays: [1, 3, 5], duration: 60, equip: "gym", sleepTarget: 7.5 } };

function renderOnboarding() {
  const d = onb.data;
  const opt = (field, v, title, sub) => `<button class="option" data-action="onb-set" data-field="${field}" data-val="${v}" aria-pressed="${String(d[field]) === String(v)}"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</button>`;
  const steps = [
    () => `
      <div class="onb-hero" data-lvl="full">${["back_squat", "pushup", "pullup"].map((id) => figure(id, { animate: true })).join("")}</div>
      <h1>Ton coach qui lit ta forme</h1>
      <p class="lead">Sommeil, récupération, journée : ta séance s'adapte chaque jour à ton énergie.</p>
      <div class="field"><label for="onb-name">Ton prénom</label><input class="input" id="onb-name" data-onb="name" maxlength="40" value="${esc(d.name)}" placeholder="Prénom" autocomplete="given-name" /></div>`,
    () => `
      <h1>Ton gabarit</h1><p class="lead">Pour tes calories et protéines.</p>
      <div class="field"><span class="label">Sexe</span><div class="segmented">
        ${[["m", "Homme"], ["f", "Femme"]].map(([v, l]) => `<button data-action="onb-set" data-field="sex" data-val="${v}" aria-pressed="${d.sex === v}">${l}</button>`).join("")}
      </div></div>
      <div class="field"><label for="o-age">Âge</label><input class="input" id="o-age" type="number" inputmode="numeric" min="14" max="90" data-onb="age" value="${d.age}" /></div>
      <div class="grid-2 field-grid">
        <div class="field"><label for="o-h">Taille (cm)</label><input class="input" id="o-h" type="number" inputmode="numeric" min="120" max="230" data-onb="height" value="${d.height}" /></div>
        <div class="field"><label for="o-w">Poids (kg)</label><input class="input" id="o-w" type="number" inputmode="decimal" step="0.1" min="30" max="300" data-onb="weight" value="${d.weight}" /></div>
      </div>`,
    () => `
      <h1>Ton niveau</h1><p class="lead">Volume et exercices ajustés.</p>
      <div class="option-list">
        ${opt("level", "beginner", "Débutant", "Moins de 6 mois")}
        ${opt("level", "intermediate", "Intermédiaire", "Je connais les mouvements de base")}
        ${opt("level", "advanced", "Confirmé", "Plusieurs années")}
      </div>`,
    () => `
      <h1>Ton rythme</h1><p class="lead">Tes jours d'entraînement.</p>
      ${dayChips(d.trainDays, "onb-day")}
      <div class="tags" style="margin-top:12px"><span class="tag">${d.trainDays.length} séances</span><span class="tag">${{ 2: "Full body", 3: "Full body", 4: "Haut / Bas", 5: "Haut / Bas + PPL" }[d.trainDays.length]}</span></div>
      <div class="field" style="margin-top:24px"><span class="label">Temps par séance</span><div class="segmented">
        ${[45, 60, 75].map((v) => `<button data-action="onb-set" data-field="duration" data-val="${v}" aria-pressed="${d.duration === v}">${v} min</button>`).join("")}
      </div></div>`,
    () => `
      <h1>Ton matériel</h1><p class="lead">Exercices choisis en conséquence.</p>
      <div class="option-list">
        ${opt("equip", "gym", "Salle de sport", "Barres, machines, poulies")}
        ${opt("equip", "db", "Haltères à la maison", "Haltères et un banc")}
        ${opt("equip", "bw", "Poids du corps", "Une barre ou une table solide")}
      </div>`,
    () => `
      <h1>Ton sommeil</h1><p class="lead">Combien d'heures pour être vraiment reposé ?</p>
      <div class="option-list">
        ${[[7, "7 heures"], [7.5, "7 h 30"], [8, "8 heures"], [8.5, "8 h 30"]].map(([v, l]) => opt("sleepTarget", v, l, "")).join("")}
      </div>`,
  ];
  const last = onb.step === steps.length - 1;
  $app.innerHTML = `
    <div class="onb">
      <div class="onb-progress">${steps.map((_, i) => `<i class="${i <= onb.step ? "on" : ""}"></i>`).join("")}</div>
      <div class="grow">${steps[onb.step]()}</div>
      <div class="row" style="margin-top:32px">
        ${onb.step ? `<button class="btn ghost" data-action="onb-back">Retour</button>` : ""}
        <button class="btn white grow" data-action="onb-next">${last ? "C'est parti" : "Continuer"}</button>
      </div>
    </div>`;
  frenchSpaces($app);
}

const FIELD_ERRORS = { age: "L'âge doit être entre 14 et 90 ans.", height: "La taille doit être entre 120 et 230 cm.", weight: "Le poids doit être entre 30 et 300 kg." };

function toggleDay(days, d) {
  const set = new Set(days);
  if (set.has(d)) {
    if (set.size <= 2) return toast("Au moins 2 jours par semaine"), null;
    set.delete(d);
  } else {
    if (set.size >= 5) return toast("5 jours maximum : garde du temps pour récupérer"), null;
    set.add(d);
  }
  return [...set].sort();
}

// ═════════════════════════ Séance : démarrer / terminer

function activeExercise(e) {
  const sets = Array.from({ length: e.sets }, () => ({ weight: e.suggested, reps: null, rpe: null, done: false }));
  // Jour « au top » : une série lourde en premier, puis les séries de travail
  if (e.top) sets.unshift({ weight: e.top.suggested, reps: null, rpe: null, done: false, top: true, target: e.top.reps });
  return {
    id: e.id, name: e.name, timed: e.timed, bw: e.bw, uni: e.uni, rest: e.rest, rpe: e.rpe, repsTarget: e.reps, hint: e.hint, ss: e.ss || null,
    // Charge proposée, mais répétitions et RPE vides : seules les valeurs réellement saisies comptent
    sets,
  };
}

function startWorkout() {
  const s = store.get();
  if (s.active && !isStale(s.active)) return go("workout");
  if (s.active) return toast("Enregistre ou supprime d'abord la séance restée ouverte");
  const { session, r } = todayPlan(s);
  store.update((st) => {
    st.active = session.recovery
      ? { date: dateKey(), level: session.level, title: session.title, recovery: true, readiness: r.score, startedAt: Date.now(), lastActivity: Date.now(),
          items: session.items.map((it) => ({ ...it, done: false })) }
      : {
          date: dateKey(), level: session.level, dayIndex: session.dayIndex, title: session.title, readiness: r.score,
          startedAt: Date.now(), lastActivity: Date.now(), warmup: session.warmup,
          finisher: session.finisher, finisherDone: false,
          exercises: session.exercises.map(activeExercise),
        };
  });
  go("workout");
}

function finishWorkout({ stale = false } = {}) {
  const s = store.get();
  const a = s.active;
  const anyDone = a.recovery ? a.items.some((i) => i.done) : a.exercises.some((e) => e.sets.some((x) => x.done));
  if (!anyDone && !confirm("Aucune série validée. Terminer quand même ?")) return;
  // Séance oubliée : la durée s'arrête à la dernière série validée
  const end = stale ? (a.lastActivity || a.startedAt) : Date.now();
  const minutes = Math.max(1, Math.round((end - a.startedAt) / 60000));
  const volume = a.recovery ? 0 : a.exercises.reduce((t, e) => t + e.sets.filter((x) => x.done).reduce((u, x) => u + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0);
  store.update((st) => {
    st.sessions.unshift({
      date: a.date, level: a.level, dayIndex: a.recovery ? null : a.dayIndex, title: a.title, readiness: a.readiness, minutes, volume,
      finisher: a.finisher ? { name: a.finisher.name, done: !!a.finisherDone } : null,
      exercises: a.recovery ? [] : a.exercises.map((e) => ({
        id: e.id, name: e.name, repsTarget: e.repsTarget, rpe: e.rpe,
        sets: e.sets.map((x) => ({ weight: Number(x.weight) || 0, reps: Number(x.reps) || 0, rpe: x.rpe != null ? Number(x.rpe) : null, done: x.done, ...(x.top ? { top: true } : {}) })),
      })),
    });
    st.sessions.sort((x, y) => y.date.localeCompare(x.date));
    st.active = null;
  });
  stopRest();
  toast(stale ? "Séance enregistrée" : "Bien joué ! Séance enregistrée");
  go("today");
}

// ═════════════════════════ Minuteurs et écran allumé

let restEnd = 0, restTotal = 0, restTimer = null, elapsedTimer = null, liveTimer = null, wakeLock = null;

function startRest(sec) {
  restEnd = Date.now() + sec * 1000;
  restTotal = sec * 1000;
  clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250);
  tickRest();
  document.getElementById("rest-bar")?.classList.add("show");
}
function tickRest() {
  if (!restTimer) return;
  const ms = Math.max(0, restEnd - Date.now());
  const left = Math.round(ms / 1000);
  const el = document.getElementById("rest-t");
  if (el) el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const fill = document.getElementById("rest-fill");
  if (fill) fill.style.width = `${restTotal ? (1 - ms / restTotal) * 100 : 0}%`;
  if (left <= 0) {
    stopRest();
    navigator.vibrate?.([200, 100, 200]);
    toast("Repos terminé, série suivante !");
  }
}
function stopRest() {
  clearInterval(restTimer);
  restTimer = null;
  document.getElementById("rest-bar")?.classList.remove("show");
}

/** Le minuteur de repos continue hors de l'écran de séance ; seul le chrono et l'écran allumé s'arrêtent. */
function leaveWorkoutIfNeeded() {
  if (route() !== "workout") { clearInterval(elapsedTimer); keepAwake(false); }
}

async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null; // refusé (économie d'énergie…) : l'app fonctionne quand même
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  tickRest(); // les minuteurs sont ralentis en arrière-plan : on rattrape tout de suite
  if (route() === "workout" && store.get().active) keepAwake(true);
  if (route() === "today") autoSync();
});

function afterRender(r) {
  // Jauge animée depuis la valeur précédente
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll(".gauge .val").forEach((c) => c.setAttribute("stroke-dasharray", c.dataset.to))));
  if (r === "today" && ringScore != null) ringFrom = ringScore;
  startFigures($app);
  clearInterval(liveTimer);
  const live = document.getElementById("live-t");
  if (live) liveTimer = setInterval(() => { const a = store.get().active; if (a) live.textContent = liveText(a); }, 1000);
  if (r === "workout") {
    const a = store.get().active;
    clearInterval(elapsedTimer);
    const tick = () => {
      const el = document.getElementById("elapsed");
      if (el) el.textContent = clock(Math.floor((Date.now() - a.startedAt) / 1000));
    };
    tick();
    elapsedTimer = setInterval(tick, 1000);
    keepAwake(true);
    if (restTimer) { document.getElementById("rest-bar")?.classList.add("show"); tickRest(); }
  }
  if (r === "today") autoSync();
}

// ═════════════════════════ Google Health

async function syncGoogle({ interactive = true } = {}) {
  const s = store.get();
  if (syncing) return;
  if (!s.google.clientId) {
    if (interactive) { toast("Ajoute d'abord ton Client ID Google"); go("profile"); }
    return;
  }
  syncing = true;
  if (route() === "today") render();
  try {
    // Jeton expiré : Google le renouvelle sur le compte retenu, sans redemander le choix du compte
    if (interactive) await gh.authorize(s.google.clientId, { first: !s.google.connected });
    let data;
    try {
      data = await gh.fetchAll(s.google.clientId);
    } catch (e) {
      if (!(interactive && e.status === 401)) throw e;
      await gh.authorize(s.google.clientId, { force: true });
      data = await gh.fetchAll(s.google.clientId);
    }
    const today = dateKey();
    store.update((st) => {
      // Les saisies manuelles restent prioritaires si l'utilisateur les a corrigées
      for (const [k, v] of Object.entries(data.nights)) if (!(st.nights[k]?.source === "manual" && st.nights[k].edited)) st.nights[k] = v;
      // Seules les valeurs reçues remplacent les anciennes : une donnée absente n'efface rien
      for (const [k, v] of Object.entries(data.daily)) st.health.daily[k] = { ...st.health.daily[k], ...v };
      const oldest = addDays(today, -90);
      for (const k of Object.keys(st.health.daily)) if (k < oldest) delete st.health.daily[k];
      if (data.workouts) {
        const cutoff = addDays(today, -30);
        st.health.workouts = [...data.workouts, ...st.health.workouts.filter((w) => w.date < cutoff && w.date >= addDays(today, -60))];
      }
      for (const gw of data.weights) {
        const i = st.weights.findIndex((w) => w.date === gw.date);
        if (i === -1) st.weights.push({ ...gw, source: "google" });
        else if (st.weights[i].source === "google") st.weights[i] = { ...gw, source: "google" };
        else if (st.weights[i].fatPct == null && gw.fatPct != null) st.weights[i].fatPct = gw.fatPct;
      }
      st.weights.sort((a, b) => b.date.localeCompare(a.date));
      if (st.weights[0] && st.profile) st.profile.weight = st.weights[0].kg;
      st.google.connected = true;
      st.google.lastSync = Date.now();
      st.google.status = data.status;
    });
    if (interactive) {
      const n = Object.keys(data.nights).length;
      const others = Object.entries(data.status).filter(([k, v]) => k !== "sleep" && v === "ok").length;
      toast(n || others ? `${n} nuit${n > 1 ? "s" : ""} et ${others} autre${others > 1 ? "s" : ""} donnée${others > 1 ? "s" : ""} importées` : "Aucune donnée trouvée sur Google");
    }
  } catch (e) {
    if (interactive) toast(e.message);
  } finally {
    syncing = false;
    if (route() === "today") render();
  }
}

function autoSync() {
  const s = store.get();
  // Synchro silencieuse seulement si un jeton valide existe (pas de fenêtre imprévue)
  if (s.google.connected && gh.hasToken() && Date.now() - (s.google.lastSync || 0) > 15 * 60_000) {
    syncGoogle({ interactive: false });
  }
}

// ═════════════════════════ Panneaux

let sheetOpener = null;
// Un panneau ouvert = une entrée d'historique, pour que le geste retour le ferme. `pendingBack` : fermeture
// demandée par l'app, consommée au tour suivant sauf si un autre panneau s'ouvre aussitôt (même entrée).
let sheetEntry = false, pendingBack = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function openSheet(html, onMount, { lvl = "" } = {}) {
  if (pendingBack) { clearTimeout(pendingBack); pendingBack = null; }
  else if (!sheetEntry) { history.pushState({ sheet: 1 }, ""); sheetEntry = true; }
  if (!$sheetRoot.querySelector(".sheet:not(.closing)")) sheetOpener = document.activeElement;
  $sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ${lvl ? `data-lvl="${lvl}"` : ""}><div class="grab"></div><button class="icon-btn sm sheet-close" data-action="close-sheet" aria-label="Fermer">${ICON.close}</button>${html}</div>`;
  const sheet = $sheetRoot.querySelector(".sheet");
  frenchSpaces(sheet);
  onMount?.(sheet);
  dragToClose(sheet);
  startFigures(sheet);
  if (!sheet.contains(document.activeElement)) sheet.querySelector("input, button:not(.sheet-close), [tabindex]")?.focus({ preventScroll: true });
}

/** `fromHistory` : l'entrée d'historique est déjà partie (retour, changement d'écran). */
function closeSheet({ fromHistory = false } = {}) {
  if (!fromHistory && sheetEntry && !pendingBack) pendingBack = setTimeout(() => { pendingBack = null; sheetEntry = false; history.back(); });
  const sheet = $sheetRoot.querySelector(".sheet:not(.closing)");
  if (!sheet) return;
  const done = () => { if (sheet.isConnected) $sheetRoot.innerHTML = ""; };
  if (reducedMotion) done();
  else {
    sheet.classList.add("closing");
    $sheetRoot.querySelector(".sheet-backdrop")?.classList.add("closing");
    sheet.addEventListener("animationend", done, { once: true });
    setTimeout(done, 320);
  }
  sheetOpener?.focus?.({ preventScroll: true });
  sheetOpener = null;
}

/** Oublie l'entrée d'historique du panneau et le ferme. Renvoie vrai s'il y en avait une. */
function dropSheetEntry() {
  if (!sheetEntry) return false;
  clearTimeout(pendingBack);
  pendingBack = null;
  sheetEntry = false;
  closeSheet({ fromHistory: true });
  return true;
}

/** Glisser le panneau vers le bas pour le fermer (depuis le haut de son contenu). */
function dragToClose(sheet) {
  const backdrop = $sheetRoot.querySelector(".sheet-backdrop");
  let y0 = null, dy = 0, t0 = 0, dragging = false;
  const reset = () => {
    sheet.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)";
    sheet.style.transform = backdrop.style.opacity = "";
  };
  sheet.addEventListener("touchstart", (e) => {
    y0 = sheet.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    dy = 0; dragging = false; t0 = performance.now();
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (!dragging) {
      if (dy < -6) { y0 = null; return; } // vers le haut : le contenu défile normalement
      if (dy < 8) return;
      dragging = true;
    }
    e.preventDefault();
    sheet.style.transition = "none";
    sheet.style.transform = `translate(-50%, ${Math.max(0, dy)}px)`;
    backdrop.style.opacity = String(Math.max(0.2, 1 - dy / sheet.offsetHeight));
  }, { passive: false });
  const end = () => {
    if (!dragging) return void (y0 = null);
    const fast = dy / (performance.now() - t0) > 0.6;
    y0 = null; dragging = false;
    if (dy > Math.min(140, sheet.offsetHeight * 0.3) || (fast && dy > 40)) closeSheet();
    else reset();
  };
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", () => { if (dragging) { dragging = false; reset(); } y0 = null; });
}

// Typographie française : espace insécable avant : ; ? ! » et après «, pour ne jamais les laisser seuls en début de ligne
const fr = (t) => t.replace(/ ([:;?!»])/g, " $1").replace(/« /g, "« ");
function frenchSpaces(root) {
  const skip = /^(INPUT|TEXTAREA|SCRIPT|STYLE|CODE)$/;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (skip.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/ [:;?!»]|« /.test(n.nodeValue)) n.nodeValue = fr(n.nodeValue);
}

/** RPE : l'effort ressenti en fin de série, traduit en répétitions gardées en réserve. */
function rpeSheet(target) {
  const rows = [[10, "Échec : plus une seule rep possible"], [9, "Encore 1 rep en réserve"], [8, "Encore 2 reps en réserve"], [7, "Encore 3 reps en réserve"], [6, "Encore 4 reps en réserve"], [5, "Facile, comme un échauffement"]];
  const lo = Math.floor(target), hi = Math.ceil(target);
  const spare = lo === hi ? `${10 - lo} rep${10 - lo > 1 ? "s" : ""}` : `${10 - hi} à ${10 - lo} reps`;
  openSheet(`
    <h2 id="sheet-title">RPE</h2>
    <p class="muted" style="margin:6px 0 16px;font-weight:600">L'effort ressenti en fin de série, sur 10. Note-le après chaque série : l'app s'en sert pour régler tes charges.</p>
    <ol class="rpe-list">${rows.map(([n, txt]) => `<li class="${n === lo || n === hi ? "cur" : ""}"><b>${n}</b><span>${txt}</span></li>`).join("")}</ol>
    <p class="small muted" style="margin-top:14px;font-weight:600">Cible de cet exercice : <b style="color:var(--text)">RPE ${kg(target)}</b>, soit environ ${spare} en réserve.</p>`,
    null, { lvl: store.get().active?.level || "" });
}

/** Fiche d'un exercice : schéma animé, muscles, consignes ; « Remplacer » pendant la séance. */
function exSheet(id, ei) {
  const ex = EXERCISES[id] || MOVES[id];
  if (!ex) return;
  const s = store.get();
  const lvl = s.active?.level || todayPlan(s).level;
  const names = (list) => list.map((m) => MUSCLES[m]).join(", ");
  const equip = ex.equip ? ex.equip.map((e) => ({ gym: "Salle", db: "Haltères", bw: "Poids du corps" })[e]) : [];
  openSheet(`
    <div class="ex-hero">${figure(id, { player: true })}</div>
    <h2 id="sheet-title">${esc(ex.name)}</h2>
    <div class="tags" style="margin-top:8px">
      ${ex.compound != null ? `<span class="tag">${ex.compound ? "Polyarticulaire" : "Isolation"}</span>` : ""}
      ${ex.uni ? `<span class="tag">Par côté</span>` : ""}${ex.timed ? `<span class="tag">En secondes</span>` : ""}
      ${equip.map((e) => `<span class="tag">${e}</span>`).join("")}
    </div>
    ${ex.m.p.length ? `<div class="ex-muscles">${muscleMap(ex.m)}<div class="legend-m">
      <div class="lg"><i></i><div><small>Principal</small><b>${esc(names(ex.m.p))}</b></div></div>
      ${ex.m.s.length ? `<div class="lg s"><i></i><div><small>Secondaire</small><b>${esc(names(ex.m.s))}</b></div></div>` : ""}
    </div></div>` : `<div style="height:14px"></div>`}
    <ol class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
    ${ei != null && s.active && !s.active.recovery ? `<button class="btn block" style="margin-top:16px" data-sh="swap">${ICON.swap} Remplacer</button>` : ""}`,
    (el) => el.addEventListener("click", (ev) => { if (ev.target.closest("[data-sh='swap']")) { closeSheet(); swapSheet(ei); } }),
    { lvl });
}

function whySheet() {
  const s = store.get();
  const { r } = todayPlan(s);
  openSheet(`
    <h2 id="sheet-title">Ton énergie</h2>
    <div class="energy-math" data-lvl="${r.level}">
      <div><div class="n">${r.morning}</div><div class="k">Récup du matin</div></div><span class="op">−</span>
      <div><div class="n">${r.drain}</div><div class="k">Journée</div></div><span class="op">=</span>
      <div><div class="n" style="color:var(--lvl)">${r.score}</div><div class="k">Énergie</div></div>
    </div>
    <ul class="why-list">${r.reasons.map((x) => `<li class="${x.tone}"><i></i>${esc(x.text)}</li>`).join("")}</ul>
    <div class="row" style="margin:12px 0 18px;gap:8px">
      <button class="btn grow" data-sh="sleep">${ICON.moon} Ma nuit</button>
      <button class="btn grow" data-sh="checkin">${ICON.smile} Ressenti</button>
    </div>
    <div class="kicker" style="margin-bottom:8px">Ce que ça change</div>
    ${levelScale(r.level)}
    <p class="small muted" style="margin:14px 2px 0">Récup : sommeil, VFC, FC repos, ressenti, charge de la semaine. Journée : pas, sport, heures debout.</p>`,
    (el) => el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-sh]");
      if (!b) return;
      closeSheet();
      if (b.dataset.sh === "sleep") sleepSheet();
      else { checkinOpen = true; render(); document.querySelector(".checkin")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
    }), { lvl: r.level });
}

function nutriSheet() {
  const s = store.get();
  const nut = nutrition(s.profile, { weights: s.weights, daily: s.health.daily });
  openSheet(`
    <h2 id="sheet-title">Recomposition</h2>
    <div class="grid-3" style="margin:14px 0">
      <div class="stat"><div class="v">${nut.tdee.toLocaleString("fr-FR")}</div><div class="k">maintenance</div></div>
      <div class="stat"><div class="v">−${nut.deficit}</div><div class="k">déficit</div></div>
      <div class="stat"><div class="v">${nut.target.toLocaleString("fr-FR")}</div><div class="k">kcal cible</div></div>
    </div>
    <ul class="why-list">
      <li class="good"><i></i>${nut.protein} g de protéines, réparties sur 3–4 repas</li>
      <li class="good"><i></i>Léger déficit : tu perds du gras sans perdre de muscle</li>
      <li><i></i>${nut.measured ? "Dépense mesurée par Google" : "Dépense estimée (connecte Google pour la mesurer)"}</li>
    </ul>`);
}

function sleepSheet() {
  const s = store.get();
  const cur = s.nights[dateKey()];
  let hours = cur?.hours ? Math.round(cur.hours * 4) / 4 : s.profile.sleepTarget;
  let quality = cur?.quality ?? 3;
  openSheet(`
    <h2 id="sheet-title">Ta nuit</h2>
    <p class="muted small" style="margin:0 0 20px">Temps réellement dormi</p>
    <div class="stepper">
      <button class="icon-btn" data-sh="minus" aria-label="Moins 15 minutes">−</button>
      <div class="val" id="sh-hours" aria-live="polite">${fmtHours(hours)}</div>
      <button class="icon-btn" data-sh="plus" aria-label="Plus 15 minutes">+</button>
    </div>
    <div class="field" style="margin-top:24px"><span class="label">Qualité · agitée → réparatrice</span>
      <div class="ck-scale" role="group" aria-label="Qualité ressentie">${[1, 2, 3, 4, 5].map((v) => `<button class="chip" data-q="${v}" aria-pressed="${v === quality}" aria-label="Qualité ${v} sur 5">${v}</button>`).join("")}</div>
    </div>
    <button class="btn white block" style="margin-top:24px" data-sh="save">Enregistrer</button>`,
    (el) => {
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.sh === "minus") hours = Math.max(0, hours - 0.25);
        if (b.dataset.sh === "plus") hours = Math.min(14, hours + 0.25);
        if (b.dataset.q) { quality = Number(b.dataset.q); el.querySelectorAll("[data-q]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }
        el.querySelector("#sh-hours").textContent = fmtHours(hours);
        if (b.dataset.sh === "save") {
          store.update((st) => { st.nights[dateKey()] = { hours, quality, source: "manual", edited: true }; });
          closeSheet();
          toast("Nuit enregistrée, séance mise à jour");
        }
      });
    });
}

function weightSheet() {
  const s = store.get();
  openSheet(`
    <h2 id="sheet-title">Nouvelle pesée</h2>
    <p class="muted small" style="margin:0 0 20px">Le matin, à jeun.</p>
    <div class="field"><label for="w-in">Poids (kg)</label><input class="input" id="w-in" type="number" inputmode="decimal" step="0.1" value="${s.weights[0]?.kg ?? s.profile.weight}" /></div>
    <button class="btn white block" style="margin-top:20px" id="w-save">Enregistrer</button>`,
    (el) => {
      const inp = el.querySelector("#w-in");
      inp.focus(); inp.select();
      el.querySelector("#w-save").addEventListener("click", () => {
        const w = Math.round(parseFloat(inp.value.replace(",", ".")) * 10) / 10;
        if (!w || w < 30 || w > 300) return toast("Poids invalide (entre 30 et 300 kg)");
        store.update((st) => {
          const prev = st.weights.find((x) => x.date === dateKey());
          st.weights = st.weights.filter((x) => x.date !== dateKey());
          st.weights.unshift({ date: dateKey(), kg: w, ...(prev?.fatPct != null ? { fatPct: prev.fatPct } : {}), source: "manual" });
          st.weights.sort((a, b) => b.date.localeCompare(a.date));
          st.profile.weight = st.weights[0].kg;
        });
        closeSheet();
        toast("Pesée enregistrée");
      });
    });
}

function swapSheet(ei) {
  const s = store.get();
  const ex = s.active.exercises[ei];
  const alts = alternativesFor(ex.id, s.profile.equip).filter((id) => !s.active.exercises.some((e) => e.id === id));
  if (!alts.length) return toast("Pas d'alternative avec ton matériel");
  openSheet(`
    <h2 id="sheet-title">Remplacer</h2>
    <p class="muted small" style="margin:0 0 12px">${esc(ex.name)} → même mouvement :</p>
    <div style="margin:0 -16px">${alts.map((id) => `<button class="ex-row" data-alt="${id}"><span class="figbox">${figure(id)}</span>
      <span class="grow"><span class="nm">${esc(EXERCISES[id].name)}</span><br><span class="sub">${esc(EXERCISES[id].m.p.map((m) => MUSCLES[m]).join(" · "))}</span></span><span class="chev">${ICON.chev}</span></button>`).join("")}</div>`,
    (el) => el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-alt]");
      if (!b) return;
      // Nouvelle prescription complète (séries, fourchette, repos, RPE, charge) pour le niveau de la séance
      const fresh = activeExercise(exerciseEntry(b.dataset.alt, { level: s.active.level, profile: s.profile, history: s.sessions, block: blockWeek(s.profile, s.sessions) }));
      store.update((st) => {
        const old = st.active.exercises[ei];
        fresh.ss = old.ss;
        if (fresh.ss) fresh.rest = old.rest;
        const doneSets = old.sets.filter((x) => x.done);
        if (doneSets.length) {
          // Les séries déjà faites restent sur l'ancien exercice ; le nouveau reprend les séries restantes
          fresh.sets = fresh.sets.slice(0, Math.max(1, old.sets.length - doneSets.length));
          old.sets = doneSets;
          st.active.exercises.splice(ei + 1, 0, fresh);
        } else {
          st.active.exercises[ei] = fresh;
        }
      });
      closeSheet();
    }), { lvl: s.active.level });
}

function historySheet(i) {
  const x = store.get().sessions[i];
  if (!x) return;
  const d = new Date(x.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  openSheet(`
    <h2 id="sheet-title">${esc(x.title)}</h2>
    <div class="tags" style="margin:8px 0 14px"><span class="tag">${esc(d)}</span><span class="tag">${INTENSITY[x.level]?.label || ""}</span><span class="tag">${x.minutes} min</span>${x.readiness != null ? `<span class="tag">énergie ${x.readiness}</span>` : ""}</div>
    ${x.exercises?.length ? `<ul class="ex-list">${x.exercises.map((e) => {
      const sets = e.sets.filter((y) => y.done);
      return `<li><span>${esc(e.name || EXERCISES[e.id]?.name || e.id)}</span><span class="sets-t">${sets.length ? sets.map((y) => `${y.weight ? kg(y.weight) + "×" : ""}${y.reps}${y.rpe ? ` @${y.rpe}` : ""}`).join(" · ") : "non fait"}</span></li>`;
    }).join("")}</ul>` : `<p class="small muted">Séance de récupération.</p>`}
    ${x.finisher ? `<p class="small muted">${esc(x.finisher.name)} : ${x.finisher.done ? "fait" : "non fait"}</p>` : ""}`);
}

// ═════════════════════════ Événements

$app.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-action]");
  if (!b) return;
  const A = b.dataset.action;

  switch (A) {
    case "onb-set": {
      const v = b.dataset.val;
      onb.data[b.dataset.field] = isNaN(Number(v)) ? v : Number(v);
      renderOnboarding();
      return startFigures($app);
    }
    case "onb-day": {
      const days = toggleDay(onb.data.trainDays, Number(b.dataset.day));
      if (days) { onb.data.trainDays = days; onb.data.days = days.length; }
      return renderOnboarding();
    }
    case "onb-back": onb.step--; renderOnboarding(); return startFigures($app);
    case "onb-next": {
      if (onb.step === 1) {
        const bad = ["age", "height", "weight"].find((f) => !store.validProfileValue(f, onb.data[f]));
        if (bad) return toast(FIELD_ERRORS[bad]);
      }
      if (onb.step < 5) { onb.step++; renderOnboarding(); return window.scrollTo({ top: 0 }); }
      const d = onb.data;
      store.update((st) => {
        st.profile = { ...d, name: d.name.trim(), days: d.trainDays.length, createdAt: dateKey() };
        st.weights = [{ date: dateKey(), kg: d.weight, source: "manual" }];
      });
      return go("today");
    }
    case "edit-sleep": return sleepSheet();
    case "sync": return syncGoogle();
    case "why": return whySheet();
    case "nutri-info": return nutriSheet();
    case "ex-info": return exSheet(b.dataset.id, b.dataset.ei != null ? +b.dataset.ei : null);
    case "checkin-edit": checkinOpen = true; return render();
    case "checkin":
      return store.update((st) => {
        const c = (st.checkins[dateKey()] ||= {});
        const v = Number(b.dataset.val);
        if (c[b.dataset.key] === v) delete c[b.dataset.key]; else c[b.dataset.key] = v;
        if (c.energy && c.soreness && c.day) checkinOpen = false;
      });
    case "override":
      return store.update((st) => {
        const t = dateKey();
        if (b.dataset.level === autoLevel(st)) delete st.override[t]; else st.override[t] = b.dataset.level;
      });
    case "start": return startWorkout();
    case "leave-workout": return go("today");
    case "resume": return go("workout");
    case "cancel-workout":
      if (confirm("Supprimer cette séance ? Rien ne sera enregistré.")) { store.update((st) => { st.active = null; }); stopRest(); go("today"); }
      return;
    case "finish": return finishWorkout();
    case "finish-stale": return finishWorkout({ stale: true });
    case "toggle-set": {
      const ei = +b.dataset.ei, si = +b.dataset.si;
      const cur = store.get().active.exercises[ei];
      const x0 = cur.sets[si];
      // Série vide : « faite comme prévu », au bas de la fourchette (modifiable ; ne fait pas monter la charge seule)
      const asPlanned = !x0.done && (x0.reps == null || x0.reps === "");
      let nowDone = false;
      store.update((st) => {
        const e = st.active.exercises[ei];
        const x = e.sets[si];
        if (asPlanned) x.reps = (x.target || e.repsTarget)[0];
        x.done = !x.done;
        nowDone = x.done;
        st.active.lastActivity = Date.now();
        if (x.done) st.active.focus = ei;
        // Propage la charge aux séries suivantes non faites (après le top set : −10 %)
        if (x.done && x.weight != null) {
          const next = x.top ? Math.round((x.weight * 0.9) / 1.25) * 1.25 : x.weight;
          e.sets.slice(si + 1).forEach((y) => { if (!y.done && (y.weight == null || y.weight === "" || x.top)) y.weight = next; });
        }
      });
      if (nowDone) {
        navigator.vibrate?.(30);
        if (asPlanned && !toldAsPlanned) {
          toldAsPlanned = true;
          toast(`${x0.reps}${cur.timed ? " s notées" : " reps notées"} · touche le chiffre pour corriger`);
        }
        const a = store.get().active;
        const e = a.exercises[ei];
        const exDone = e.sets.every((x) => x.done);
        const lastOfAll = exDone && ei === a.exercises.length - 1;
        if (e.ss && e.rest <= 15) {
          // Superset : on enchaîne directement sur l'exercice suivant
          document.getElementById(`ex-${ei + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          if (!lastOfAll) startRest(x0.top ? 180 : e.rest);
          if (exDone) document.getElementById(`ex-${ei + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      return;
    }
    case "toggle-item": return store.update((st) => { const it = st.active.items[+b.dataset.i]; it.done = !it.done; st.active.lastActivity = Date.now(); });
    case "toggle-finisher": return store.update((st) => { st.active.finisherDone = !st.active.finisherDone; st.active.lastActivity = Date.now(); });
    case "add-set":
      return store.update((st) => {
        const e = st.active.exercises[+b.dataset.ei];
        const l = e.sets[e.sets.length - 1];
        e.sets.push({ weight: l?.weight ?? null, reps: null, rpe: null, done: false });
      });
    case "swap": return swapSheet(+b.dataset.ei);
    case "rest-add": if (restTimer) { restEnd += 30_000; restTotal += 30_000; tickRest(); } return;
    case "rest-skip": return stopRest();
    case "add-weight": return weightSheet();
    case "history": return historySheet(+b.dataset.i);
    case "rpe-info": return rpeSheet(+b.dataset.rpe);
    case "lib-group": libGroup = b.dataset.g; return render();
    case "lib-mine": libMine = !libMine; return render();
    case "set-profile": {
      const v = b.dataset.val;
      return store.update((st) => { st.profile[b.dataset.field] = isNaN(Number(v)) ? v : Number(v); });
    }
    case "toggle-day": {
      const days = toggleDay(trainDaysOf(store.get().profile), Number(b.dataset.day));
      if (!days) return;
      return store.update((st) => { st.profile.trainDays = days; st.profile.days = days.length; });
    }
    case "disconnect":
      gh.disconnect();
      store.update((st) => { st.google.connected = false; st.google.status = {}; });
      return toast("Google Health déconnecté");
    case "export": {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `forme-sauvegarde-${dateKey()}.json`;
      a.click();
      return setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    case "reset":
      if (confirm("Effacer toutes tes données (profil, séances, nuits) ?")) { store.reset(); onb.step = 0; ringFrom = null; go("today"); }
      return;
  }
});

$app.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.onb) {
    onb.data[t.dataset.onb] = t.type === "number" ? (t.value === "" ? NaN : Number(t.value)) : t.value;
  }
});

$app.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.field && t.dataset.ei != null) {
    // Saisie pendant la séance : pas de re-rendu pour garder le focus
    const ei = +t.dataset.ei, si = +t.dataset.si;
    let v = t.value === "" ? null : Number(t.value.replace(",", "."));
    if (v != null && (!Number.isFinite(v) || v < 0)) v = null;
    if (v != null && t.dataset.field === "rpe") v = Math.max(5, Math.min(10, v));
    store.update((st) => { st.active.exercises[ei].sets[si][t.dataset.field] = v; st.active.lastActivity = Date.now(); }, true);
    return;
  }
  if (t.dataset.profile) {
    const f = t.dataset.profile;
    const v = t.type === "number" ? (t.value === "" ? NaN : Number(t.value)) : t.value.trim().slice(0, 40);
    if (t.type === "number" && !store.validProfileValue(f, v)) {
      toast(FIELD_ERRORS[f]);
      return render(); // remet l'ancienne valeur
    }
    store.update((st) => { st.profile[f] = v; });
  }
  if (t.id === "g-client") {
    store.update((st) => { st.google.clientId = t.value.trim(); });
    toast("Client ID enregistré");
  }
  if (t.id === "import-file" && t.files[0]) {
    t.files[0].text().then((txt) => {
      try { store.importJSON(txt); toast("Données importées"); } catch { toast("Fichier invalide : rien n'a été modifié"); }
    });
  }
});

$sheetRoot.addEventListener("click", (ev) => { if (ev.target.closest("[data-action='close-sheet']")) closeSheet(); });
document.addEventListener("keydown", (ev) => {
  if (!$sheetRoot.innerHTML) return;
  if (ev.key === "Escape") return closeSheet();
  if (ev.key === "Tab") {
    // Garde le focus dans le panneau ouvert
    const f = [...$sheetRoot.querySelectorAll(".sheet button, .sheet input")].filter((x) => !x.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

let toastTimer, toldAsPlanned = false;
function toast(msg) {
  $toast.textContent = fr(msg);
  $toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove("show"), 2600);
}

// Re-rendu à chaque changement d'état, sauf les saisies silencieuses de la séance
store.subscribe((_, silent) => { if (!silent) render(); });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Script Google préchargé : la fenêtre de connexion s'ouvre directement au clic
if (store.get().google.connected) gh.loadGis().catch(() => {});

// Rechargé avec un panneau ouvert : son entrée d'historique ne mène plus nulle part, on la retire
if (history.state?.sheet) history.back();
render();
