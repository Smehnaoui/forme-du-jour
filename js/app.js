import * as store from "./store.js";
import {
  readiness, buildSession, nextDayIndex, splitFor, nutrition, sleepScore, levelOf, cycleOf,
  lastPerformance, exerciseEntry, weekPlan, trainDaysOf, INTENSITY, WEEKDAYS, dateKey, addDays, fmtHours,
} from "./engine.js";
import { EXERCISES, alternativesFor } from "./exercises.js";
import * as gh from "./google-health.js";

const $app = document.getElementById("app");
const $tabbar = document.getElementById("tabbar");
const $sheetRoot = document.getElementById("sheet-root");
const $toast = document.getElementById("toast");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ICON = {
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  list: `<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  flame: `<svg viewBox="0 0 24 24"><path d="M12 3c.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2.5-5 .3 1.8 1 2.8 2 3 .2-2.7-.3-5.3.5-8z"/></svg>`,
  feather: `<svg viewBox="0 0 24 24"><path d="M20 4C11 4 6 9 5 18l-2 3M9 14h6M12 10h6"/><path d="M20 4c0 8-4 13-11 14"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>`,
  swap: `<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>`,
  sync: `<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
};
const lvlIcon = (level) => ICON[INTENSITY[level].icon];

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
    return renderOnboarding();
  }
  let r = route();
  if (r === "workout" && !s.active) r = "today";
  const views = { today: viewToday, program: viewProgram, progress: viewProgress, profile: viewProfile, workout: viewWorkout };
  const view = views[r] || viewToday;
  const tabs = r !== "workout";
  $tabbar.classList.toggle("hidden", !tabs);
  $app.classList.toggle("no-tabs", !tabs);
  $tabbar.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.tab === r);
    if (a.dataset.tab === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $app.innerHTML = view(s);
  afterRender(r);
}

function go(path) {
  if (location.hash === `#/${path}`) render();
  else location.hash = `#/${path}`;
  window.scrollTo({ top: 0 });
}

window.addEventListener("hashchange", () => { render(); window.scrollTo({ top: 0 }); });

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

/** Niveau proposé sans choix manuel : récupération les jours de repos, sinon d'après la forme. */
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
  const session = buildSession({
    profile: s.profile, level,
    dayIndex: nextDayIndex(s.profile, s.sessions),
    history: s.sessions,
    cycle: cycleOf(s.profile, s.sessions),
    workoutsToday: s.health.workouts.filter((w) => w.date === today),
  });
  const doneToday = s.sessions.find((x) => x.date === today);
  return { today, night, checkin, r, wp, level, session, doneToday, restDay: wp.kind === "rest" && !forced };
}

/** Séance ouverte depuis plus de 6 h sans activité : probablement oubliée. */
function isStale(a) {
  return a && Date.now() - (a.lastActivity || a.startedAt) > 6 * 3600_000;
}

// ═════════════════════════ Vue : Aujourd'hui

let ringFrom = null;   // score affiché au rendu précédent, pour animer l'anneau depuis cette valeur
let ringScore = null;

function viewToday(s) {
  const p = todayPlan(s);
  const { r, wp, level, session, night, checkin, doneToday } = p;
  const lvl = INTENSITY[level];
  const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Salut" : "Bonsoir";
  const nut = nutrition(s.profile, { weights: s.weights, daily: s.health.daily });
  const C = 2 * Math.PI * 50;
  ringScore = r.score;
  const from = ringFrom == null ? C : C * (1 - ringFrom / 100);
  const syncLabel = s.google.lastSync ? `Google · ${new Date(s.google.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Google Health";

  const sleepBlock = night ? `
    <div class="sleep-stats">
      <div class="stat"><div class="v">${fmtHours(night.hours)}</div><div class="k">Sommeil</div></div>
      <div class="stat"><div class="v">${night.efficiency != null ? Math.round(night.efficiency) + "%" : (night.quality ?? "–") + "/5"}</div><div class="k">${night.efficiency != null ? "Efficacité" : "Qualité"}</div></div>
      <div class="stat"><div class="v">${night.deepMin != null ? fmtHours((night.deepMin + night.remMin) / 60) : r.sleep ? r.sleep.score : "–"}</div><div class="k">${night.deepMin != null ? "Profond+REM" : "Note nuit"}</div></div>
    </div>
    <div class="row between" style="margin-top:12px">
      <span class="pill">${night.source === "google" ? esc(syncLabel) : "Saisie manuelle"}</span>
      <span class="row" style="gap:16px">
        ${s.google.connected ? `<button class="link-btn" data-action="sync">Actualiser</button>` : ""}
        <button class="link-btn" data-action="edit-sleep">Corriger</button>
      </span>
    </div>` : `
    <div class="empty-sleep">
      ${s.google.clientId ? `<button class="btn primary block" data-action="sync">${ICON.sync} Récupérer ma nuit (Google)</button>` : ""}
      <button class="btn ${s.google.clientId ? "" : "primary"} block" data-action="edit-sleep">${ICON.moon} Saisir ma nuit</button>
    </div>`;

  const scale = (key, label, val, lo, hi) => `
    <div class="scale" role="group" aria-label="${label}">
      ${[1, 2, 3, 4, 5].map((v) => `<button class="chip" data-action="checkin" data-key="${key}" data-val="${v}" aria-pressed="${val === v}" aria-label="${label} ${v} sur 5">${v}</button>`).join("")}
    </div>
    <div class="scale-labels"><span>${lo}</span><span>${hi}</span></div>`;

  const a = s.active;
  const staleBlock = isStale(a) ? `
    <section class="card stale-card">
      <div class="eyebrow">Séance restée ouverte</div>
      <h3 style="margin-top:4px">${esc(a.title)} · ${new Date(a.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}</h3>
      <p class="small muted" style="margin:6px 0 14px">Tu l'as commencée sans la terminer. Enregistre ce que tu as fait ou supprime-la.</p>
      <div class="grid-2">
        <button class="btn" data-action="cancel-workout">Supprimer</button>
        <button class="btn primary" data-action="finish-stale">Enregistrer</button>
      </div>
    </section>` : "";

  const items = session.recovery
    ? session.items.map((it) => `<li><span>${esc(it.name)}</span><span class="sets">${esc(it.detail.split(",")[0])}</span></li>`).join("")
    : session.exercises.map((e) => `<li><span>${esc(e.name)}</span><span class="sets">${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.timed ? " s" : ""}${e.suggested ? ` · ${String(e.suggested).replace(".", ",")} kg` : ""}</span></li>`).join("")
      + (session.finisher ? `<li><span>${esc(session.finisher.name)}</span><span class="sets">bonus</span></li>` : "");

  const planNote = p.restDay ? wp.reason : wp.kind === "catchup" && !s.override[p.today] ? wp.reason : "";
  const sessionBlock = doneToday ? `
    <div class="card done-card" data-lvl="${doneToday.level}">
      <div class="big">${ICON.check}</div>
      <h2>Séance faite</h2>
      <p class="muted small">${esc(doneToday.title)} · ${doneToday.minutes} min${doneToday.volume ? ` · ${Math.round(doneToday.volume).toLocaleString("fr-FR")} kg soulevés` : ""}</p>
      <p class="muted small">Pense à atteindre tes ${nut.protein} g de protéines et à te coucher tôt ce soir.</p>
    </div>` : `
    <div class="card session-card" data-lvl="${level}">
      <div class="row between">
        <span class="eyebrow">${p.restDay ? "Jour de repos" : wp.kind === "catchup" ? "Séance de rattrapage" : "Séance proposée"}</span>
        <span class="pill lvl-pill"><span class="lvl-ico">${lvlIcon(level)}</span>${lvl.short}</span>
      </div>
      <h2 style="margin-top:8px">${esc(session.title)}</h2>
      <div class="session-meta">
        <span>${ICON.clock} ~${session.minutes} min</span>
        <span>${ICON.list} ${session.recovery ? session.items.length + " étapes" : session.exercises.length + " exercices"}</span>
        <span>${ICON.bolt} ${esc(session.focus)}</span>
      </div>
      ${planNote ? `<div class="note plan-note">${esc(planNote)}</div>` : ""}
      <div class="note">${esc(session.note)}</div>
      ${session.cardioDone ? `<div class="note">Cardio déjà fait aujourd'hui (${session.cardioDone} min d'après Google) : pas de finisher.</div>` : ""}
      <ul class="ex-list">${items}</ul>
      <button class="btn primary block" data-action="start">${a && !isStale(a) ? "Reprendre la séance" : p.restDay ? "Commencer la récupération" : "Commencer"}</button>
      <div style="margin-top:14px">
        <div class="eyebrow" style="margin-bottom:8px">${p.restDay ? "S'entraîner quand même" : "Ajuster l'intensité"}</div>
        <div class="segmented">
          ${Object.values(INTENSITY).map((i) => `<button data-action="override" data-level="${i.key}" aria-pressed="${level === i.key}">${i.short}</button>`).join("")}
        </div>
      </div>
    </div>`;

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">${esc(dateStr)}</div>
        <h1>${hello}${s.profile.name ? ", " + esc(s.profile.name) : ""}</h1>
      </div>
    </header>

    ${staleBlock}

    <section class="card readiness" data-lvl="${levelOf(r.score)}">
      <div class="readiness-top">
        <div class="ring" role="img" aria-label="Score de forme ${r.score} sur 100">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="track" cx="60" cy="60" r="50" fill="none" stroke-width="12"/>
            <circle class="val" cx="60" cy="60" r="50" fill="none" stroke-width="12"
              stroke-dasharray="${C}" stroke-dashoffset="${from}" data-target="${C * (1 - r.score / 100)}"/>
          </svg>
          <div class="center" aria-hidden="true"><div><div class="score">${r.score}</div><div class="of">FORME</div></div></div>
        </div>
        <div class="grow">
          <div class="eyebrow">Ta forme aujourd'hui</div>
          <div class="level-name"><span class="lvl-ico">${lvlIcon(levelOf(r.score))}</span>${INTENSITY[levelOf(r.score)].label}</div>
          ${!doneToday && s.override[p.today] && s.override[p.today] !== autoLevel(s, r, wp) ?`<div class="small muted">Intensité choisie manuellement</div>` : ""}
        </div>
      </div>
      <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${healthStats(r)}
      ${sleepBlock}
    </section>

    ${weekStrip(wp)}

    <div class="section-title"><h3>Ton ressenti</h3><span class="small muted">Affine la séance</span></div>
    <section class="card stack">
      <div><div class="small" style="font-weight:700;margin-bottom:8px">Énergie</div>${scale("energy", "Énergie", checkin?.energy, "Vidé", "Au top")}</div>
      <div><div class="small" style="font-weight:700;margin-bottom:8px">Courbatures</div>${scale("soreness", "Courbatures", checkin?.soreness, "Aucune", "Fortes")}</div>
    </section>

    <div class="section-title"><h3>Entraînement</h3></div>
    ${sessionBlock}

    <div class="section-title"><h3>Nutrition du jour</h3><span class="small muted">Recomposition</span></div>
    <section class="nutri">
      <div class="stat card flat"><div class="v num">${nut.target.toLocaleString("fr-FR")}</div><div class="k">kcal cible</div></div>
      <div class="stat card flat"><div class="v num">${nut.protein} g</div><div class="k">protéines</div></div>
      <div class="stat card flat">${nut.stepsToday != null
        ? `<div class="v num">${(nut.stepsToday / 1000).toFixed(1).replace(".", ",")}k</div><div class="k">/ ${(nut.steps / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k pas</div><div class="mini-bar"><i style="width:${Math.min(100, (nut.stepsToday / nut.steps) * 100)}%"></i></div>`
        : `<div class="v num">${(nut.steps / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k</div><div class="k">pas</div>`}</div>
    </section>
    <p class="small muted" style="margin:10px 4px 0">Léger déficit (~${nut.deficit} kcal sous ta maintenance de ${nut.tdee.toLocaleString("fr-FR")} kcal${nut.measured ? ", mesurée par Google" : ""}) + beaucoup de protéines : tu perds du gras en construisant du muscle.</p>
  `;
}

/** Mesures de récupération Google affichées seulement quand elles existent. */
function healthStats(r) {
  const m = r.metrics;
  const tiles = [];
  if (m.hrv) {
    const pct = m.hrv.base ? Math.round((m.hrv.value / m.hrv.base - 1) * 100) : null;
    tiles.push([`${Math.round(m.hrv.value)} ms`, "VFC", pct == null ? "référence en cours" : `${pct >= 0 ? "+" : ""}${pct} % vs moy.`, pct != null && pct <= -10]);
  }
  if (m.rhr) {
    const d = m.rhr.base ? Math.round(m.rhr.value - m.rhr.base) : null;
    tiles.push([`${Math.round(m.rhr.value)}`, "FC repos", d == null ? "référence en cours" : `${d > 0 ? "+" : ""}${d} bpm vs moy.`, d != null && d >= 5]);
  }
  if (m.load) {
    const ratio = m.load.ratio;
    tiles.push([ratio.toFixed(1).replace(".", ","), "Charge 7 j", ratio > 1.5 ? "très élevée" : ratio > 1.3 ? "élevée" : ratio < 0.8 ? "basse" : "normale", ratio > 1.3]);
  }
  if (!tiles.length) return "";
  return `<div class="health-stats">${tiles.map(([v, k, d, warn]) => `
    <div class="stat"><div class="v">${v}</div><div class="k">${k}</div><div class="d ${warn ? "warn" : ""}">${d}</div></div>`).join("")}</div>`;
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

  const body = a.recovery
    ? `<section class="card">
        ${a.items.map((it, i) => `
          <div class="set-row recovery-row ${it.done ? "is-done" : ""}">
            <div><div style="font-weight:700">${esc(it.name)}</div><div class="small muted">${esc(it.detail)}</div></div>
            <button class="check" data-action="toggle-item" data-i="${i}" aria-label="Valider ${esc(it.name)}" aria-pressed="${!!it.done}">${ICON.check}</button>
          </div>`).join("")}
      </section>`
    : a.exercises.map((e, ei) => {
        const exDone = e.sets.every((x) => x.done);
        const last = lastPerformance(e.id, s.sessions);
        const lastTxt = last ? last.sets.filter((x) => x.done).map((x) => `${x.weight ? String(x.weight).replace(".", ",") : "PDC"}×${x.reps}`).join(" · ") : null;
        const unit = e.timed ? "s" : "reps";
        return `
        <section class="card ex-card ${exDone ? "done" : ""}" id="ex-${ei}">
          <div class="row between">
            <div class="grow">
              <div class="eyebrow">${ei + 1}/${a.exercises.length} · ${e.repsTarget[0]}–${e.repsTarget[1]} ${unit} · RPE ${e.rpe}</div>
              <h3 style="margin-top:4px">${esc(e.name)}</h3>
            </div>
            <button class="icon-btn" data-action="swap" data-ei="${ei}" aria-label="Changer d'exercice">${ICON.swap}</button>
          </div>
          <div class="cue">${esc(e.cue)}</div>
          ${e.hint ? `<div class="hint-line">${esc(e.hint)}</div>` : ""}
          <div class="set-head"><span>#</span><span>${e.timed ? "—" : "Kg"}</span><span>${e.timed ? "Sec." : "Reps"}</span><span>RPE</span><span></span></div>
          ${e.sets.map((x, si) => `
            <div class="set-row ${x.done ? "is-done" : ""}">
              <span class="idx">${si + 1}</span>
              <input type="number" inputmode="decimal" step="0.25" min="0" value="${x.weight ?? ""}" placeholder="${e.timed ? "—" : e.bw ? "PDC" : "kg"}" ${e.timed ? "disabled" : ""}
                data-field="weight" data-ei="${ei}" data-si="${si}" aria-label="Charge série ${si + 1}" />
              <input type="number" inputmode="numeric" min="0" value="${x.reps ?? ""}" placeholder="${e.repsTarget[0]}–${e.repsTarget[1]}"
                data-field="reps" data-ei="${ei}" data-si="${si}" aria-label="${e.timed ? "Secondes" : "Répétitions"} série ${si + 1}" />
              <input type="number" inputmode="decimal" step="0.5" min="5" max="10" value="${x.rpe ?? ""}" placeholder="${e.rpe}"
                data-field="rpe" data-ei="${ei}" data-si="${si}" aria-label="Effort ressenti (RPE) série ${si + 1}" />
              <button class="check" data-action="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Valider la série ${si + 1}" aria-pressed="${!!x.done}">${ICON.check}</button>
            </div>`).join("")}
          <div class="row between" style="margin-top:10px">
            <span class="last-time" style="margin:0">${lastTxt ? `Dernière fois : ${lastTxt}` : "Première fois : trouve une charge où tu gardes 2–3 reps en réserve"}</span>
            <button class="link-btn" data-action="add-set" data-ei="${ei}">+ série</button>
          </div>
        </section>`;
      }).join("") + (a.finisher ? `
        <section class="card finisher">
          <div class="row between">
            <div class="grow"><div class="eyebrow">Bonus brûle-graisse</div><h3 style="margin-top:4px">${esc(a.finisher.name)}</h3><div class="small muted">${esc(a.finisher.detail)}</div></div>
            <button class="check ${a.finisherDone ? "on" : ""}" data-action="toggle-finisher" aria-label="Valider le bonus" aria-pressed="${!!a.finisherDone}">${ICON.check}</button>
          </div>
        </section>` : "");

  return `
    <div class="workout-head" data-lvl="${a.level}">
      <div class="row">
        <button class="icon-btn" data-action="leave-workout" aria-label="Retour">${ICON.back}</button>
        <div class="grow">
          <div class="eyebrow" style="color:var(--lvl)">${INTENSITY[a.level].label}</div>
          <h3>${esc(a.title)}</h3>
        </div>
        <div class="num" style="font-size:20px;font-weight:700" id="elapsed">0:00</div>
      </div>
      <div class="progress-bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    </div>
    <div data-lvl="${a.level}" class="stack">${body}</div>
    <div class="bottom-action"><div class="inner">
      <button class="btn ghost" data-action="cancel-workout">Abandonner</button>
      <button class="btn primary grow" data-action="finish">Terminer la séance</button>
    </div></div>
    <div class="rest-bar" id="rest-bar" aria-live="polite">
      <div class="t" id="rest-t">0:00</div><div class="lbl">Repos</div>
      <button data-action="rest-add">+30 s</button><button data-action="rest-skip">Passer</button>
    </div>`;
}

// ═════════════════════════ Vue : Programme

function viewProgram(s) {
  const split = splitFor(s.profile);
  const next = nextDayIndex(s.profile, s.sessions);
  const cycle = cycleOf(s.profile, s.sessions);
  const days = trainDaysOf(s.profile);
  const dayNames = [...days].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map((d) => WEEKDAYS[d].toLowerCase()).join(", ");
  const equipName = { gym: "Salle de sport", db: "Haltères à la maison", bw: "Poids du corps" }[s.profile.equip];
  return `
    <header class="page-head"><div><div class="eyebrow">${days.length} séances / semaine · ${esc(equipName)}</div><h1>Ton programme</h1></div></header>
    <p class="muted" style="margin:-6px 4px 12px">${split.length === 3 ? "Full body : chaque muscle est travaillé souvent, idéal pour perdre du gras tout en prenant du muscle. Toujours 48 h entre deux séances." : "Haut / Bas : plus de volume par muscle, parfait pour progresser en recomposition."}</p>
    <p class="small muted" style="margin:0 4px 20px">Jours prévus : ${esc(dayNames)} (modifiables dans le profil). Une séance manquée est rattrapée le lendemain. Les séries et les charges s'adaptent chaque jour à ta forme ; ci-dessous la version standard.</p>
    ${split.map((day, i) => {
      const sess = buildSession({ profile: s.profile, level: "normal", dayIndex: i, history: s.sessions, cycle });
      return `
      <section class="card program-day" ${i === next ? 'data-lvl="normal" data-next' : ""}>
        <div class="row between" style="align-items:flex-start">
          <div class="grow"><div class="eyebrow">Jour ${i + 1}${i === next ? " · prochaine séance" : ""}</div><h3 style="margin-top:4px">${esc(day.name)}</h3></div>
          <span class="small muted" style="text-align:right">${esc(day.focus)}<br>~${sess.minutes} min</span>
        </div>
        <ul class="ex-list" style="margin:12px 0 0">
          ${sess.exercises.map((e) => `<li><span>${esc(e.name)}</span><span class="sets">${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.timed ? " s" : ""}</span></li>`).join("")}
          ${sess.finisher ? `<li><span>${esc(sess.finisher.name)}</span><span class="sets">bonus</span></li>` : ""}
        </ul>
      </section>`;
    }).join("")}

    <div class="section-title"><h3>Comment ça s'adapte</h3></div>
    <section class="card">
      ${[
        ["full", "75 et +", "Séries lourdes (4 × 6–8), RPE 8 et finisher en intervalles si le temps le permet."],
        ["normal", "52 – 74", "Séance standard (3 × 8–10), RPE 7 et cardio doux en fin de séance."],
        ["light", "32 – 51", "Version légère : charges réduites, 2 séries, variantes guidées, aucune série à l'échec."],
        ["recovery", "moins de 32", "Pas de muscu : mobilité, marche et respiration pour récupérer."],
      ].map(([k, range, txt]) => `
        <div class="zone" data-lvl="${k}">
          <div class="zone-ico">${lvlIcon(k)}</div>
          <div><div style="font-weight:700">${INTENSITY[k].label} <span class="muted small">· score ${range}</span></div><div class="small muted">${txt}</div></div>
        </div>`).join("")}
    </section>
    <p class="small muted" style="margin:12px 4px">Le score combine ton sommeil, ton ressenti et, si Google Health les fournit, ta variabilité cardiaque, ta FC au repos et ta charge d'entraînement. Une donnée absente est simplement ignorée. Les charges sont calculées à partir de ton 1RM estimé sur la dernière séance.</p>
  `;
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

  return `
    <header class="page-head"><div><div class="eyebrow">Ton évolution</div><h1>Progrès</h1></div></header>
    <section class="grid-3">
      <div class="stat card flat"><div class="v num">${thisWeek}/${trainDaysOf(s.profile).length}</div><div class="k">séances (7 j)</div></div>
      <div class="stat card flat"><div class="v num">${lifted.length}</div><div class="k">au total</div></div>
      <div class="stat card flat"><div class="v num">${delta == null ? "–" : (delta > 0 ? "+" : "") + delta.toFixed(1).replace(".", ",")}</div><div class="k">kg depuis le début</div></div>
    </section>

    <div class="section-title"><h3>Poids</h3><button class="link-btn" data-action="add-weight">+ Ajouter une pesée</button></div>
    <section class="card">
      ${w.length >= 2 ? weightChart(w) : `<p class="muted small" style="margin:0">Pèse-toi le matin à jeun, 2–3 fois par semaine. La tendance compte plus que le chiffre du jour.${w.length ? ` Dernière pesée : <strong>${w[0].kg} kg</strong>.` : ""}</p>`}
      ${fat ? `<div class="grid-2" style="margin-top:14px">
        <div class="stat"><div class="v">${String(fat.fatPct).replace(".", ",")} %</div><div class="k">masse grasse</div></div>
        <div class="stat"><div class="v">${(fat.kg * (1 - fat.fatPct / 100)).toFixed(1).replace(".", ",")} kg</div><div class="k">masse maigre</div></div>
      </div>` : ""}
    </section>

    <div class="section-title"><h3>Sommeil · 14 nuits</h3><span class="small muted">objectif ${fmtHours(s.profile.sleepTarget)}</span></div>
    <section class="card">${sleepChart(s)}</section>

    ${sports.length ? `
      <div class="section-title"><h3>Autres sports · 14 jours</h3><span class="small muted">Google Health</span></div>
      <section class="card">${sports.map((x) => `
        <div class="history-item"><div class="badge">${new Date(x.date + "T12:00").getDate()}</div>
          <div class="grow"><div style="font-weight:700;text-transform:capitalize">${esc(x.name)}</div><div class="small muted">${x.minutes} min${x.legs ? " · compte pour la récupération des jambes" : ""}</div></div></div>`).join("")}
      </section>` : ""}

    <div class="section-title"><h3>Historique</h3></div>
    <section class="card">
      ${s.sessions.length ? s.sessions.slice(0, 30).map((x, i) => {
        const d = new Date(x.date + "T12:00");
        return `
        <button class="history-item" data-action="history" data-i="${i}" data-lvl="${x.level}">
          <div class="badge"><b>${d.getDate()}</b><small>${d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</small></div>
          <div class="grow">
            <div style="font-weight:700">${esc(x.title)}</div>
            <div class="small muted">${d.toLocaleDateString("fr-FR", { weekday: "long" })} · ${INTENSITY[x.level].short} · ${x.minutes} min${x.volume ? ` · ${Math.round(x.volume).toLocaleString("fr-FR")} kg` : ""}</div>
          </div>
          <span class="chev" aria-hidden="true">›</span>
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
      <path d="${d} L${x(pts.length - 1)},${y(min)} L${x(0)},${y(min)} Z" fill="var(--accent)" opacity=".12"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.kg)}" r="3.5" fill="var(--bg)" stroke="var(--accent)" stroke-width="2"><title>${p.date} : ${p.kg} kg</title></circle>`).join("")}
      <text x="${x(pts.length - 1)}" y="${y(pts[pts.length - 1].kg) - 10}" text-anchor="end" style="fill:var(--text);font-size:12px;font-weight:700">${pts[pts.length - 1].kg} kg</text>
    </svg>`;
}

function sleepChart(s) {
  const days = [];
  const d = new Date();
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    days.push({ key: dateKey(dd), label: dd.toLocaleDateString("fr-FR", { weekday: "narrow" }), night: s.nights[dateKey(dd)] });
  }
  if (!days.some((x) => x.night)) return `<p class="muted small" style="margin:0">Aucune nuit enregistrée. Connecte Google Health dans ton profil ou saisis tes nuits depuis l'écran Aujourd'hui.</p>`;
  const W = 320, H = 150, P = 20, maxH = 10;
  const bw = (W - P) / 14;
  const y = (h) => H - P - (Math.min(h, maxH) / maxH) * (H - P - 8);
  const lvlOf = (n) => levelOf(sleepScore(n, s.profile.sleepTarget)?.score ?? 0);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Durée de sommeil sur 14 nuits">
      <line x1="${P}" x2="${W}" y1="${y(s.profile.sleepTarget)}" y2="${y(s.profile.sleepTarget)}" stroke="var(--muted)" stroke-dasharray="3 4"/>
      <text x="0" y="${y(s.profile.sleepTarget) + 3}">${fmtHours(s.profile.sleepTarget)}</text>
      ${days.map((x, i) => {
        const cx = P + i * bw + 3;
        const bar = x.night ? `<rect x="${cx}" y="${y(x.night.hours)}" width="${bw - 6}" height="${H - P - y(x.night.hours)}" rx="4" fill="var(--c-${lvlOf(x.night)})"><title>${x.key} : ${fmtHours(x.night.hours)}</title></rect>`
          : `<rect x="${cx}" y="${H - P - 3}" width="${bw - 6}" height="3" rx="1.5" fill="var(--line)"/>`;
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
  return `
    <header class="page-head"><div><div class="eyebrow">Réglages</div><h1>Profil</h1></div></header>

    <section class="card">
      <div class="field"><label for="pf-name">Prénom</label><input class="input" id="pf-name" data-profile="name" maxlength="40" value="${esc(p.name)}" /></div>
      <div class="grid-3 field-grid">
        <div class="field"><label for="pf-age">Âge</label><input class="input" id="pf-age" type="number" inputmode="numeric" min="14" max="90" data-profile="age" value="${p.age}" /></div>
        <div class="field"><label for="pf-h">Taille (cm)</label><input class="input" id="pf-h" type="number" inputmode="numeric" min="120" max="230" data-profile="height" value="${p.height}" /></div>
        <div class="field"><label for="pf-w">Poids (kg)</label><input class="input" id="pf-w" type="number" inputmode="decimal" step="0.1" min="30" max="300" data-profile="weight" value="${p.weight}" /></div>
      </div>
      <div class="field"><span class="label">Sexe</span>${seg("sex", [["m", "Homme"], ["f", "Femme"]], p.sex)}</div>
      <div class="field"><span class="label">Niveau</span>${seg("level", [["beginner", "Débutant"], ["intermediate", "Intermédiaire"], ["advanced", "Confirmé"]], p.level)}</div>
      <div class="field"><span class="label">Jours d'entraînement · ${days.length} par semaine (${days.length >= 4 ? "haut / bas" : "full body"})</span>${dayChips(days, "toggle-day")}</div>
      <div class="field"><span class="label">Durée</span>${seg("duration", [[45, "45 min"], [60, "60 min"], [75, "75 min"]], p.duration)}</div>
      <div class="field"><span class="label">Équipement</span>${seg("equip", [["gym", "Salle"], ["db", "Haltères"], ["bw", "Aucun"]], p.equip)}</div>
      <div class="field"><span class="label">Objectif de sommeil</span>${seg("sleepTarget", [[7, "7h"], [7.5, "7h30"], [8, "8h"], [8.5, "8h30"]], p.sleepTarget)}</div>
    </section>

    <div class="section-title"><h3>Google Health</h3><span class="pill ${g.connected ? "ok" : ""}"><span class="dot"></span>${g.connected ? "Connecté" : "Non connecté"}</span></div>
    <section class="card stack">
      <p class="small muted" style="margin:0">Lecture seule depuis la Google Health API : sommeil, variabilité cardiaque, FC au repos, pas, dépense, séances de sport, poids et masse grasse. Chaque donnée est facultative : si ta montre ou ta balance n'en fournit pas, l'app s'en passe. Les données restent sur ton téléphone.</p>
      ${g.connected && Object.keys(g.status || {}).length ? `
        <ul class="sources">${Object.entries(gh.SOURCES).map(([k, src]) => {
          const [txt, cls] = SOURCE_STATUS[g.status[k]] || ["Pas encore lu", ""];
          return `<li><span>${esc(src.label)}</span><span class="src ${cls}">${txt}</span></li>`;
        }).join("")}</ul>` : ""}
      ${g.lastSync ? `<div class="small muted">Dernière synchro : ${new Date(g.lastSync).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>` : ""}
      <div class="${g.connected ? "grid-2" : ""}">
        <button class="btn primary ${g.connected ? "" : "block"}" data-action="sync">${ICON.sync} ${g.connected ? "Synchroniser" : "Connecter"}</button>
        ${g.connected ? `<button class="btn ghost" data-action="disconnect">Déconnecter</button>` : ""}
      </div>
      <details class="small muted"><summary>Réglages avancés</summary>
        <div class="field" style="margin-top:12px"><label for="g-client">Client ID OAuth Google</label><input class="input" id="g-client" placeholder="xxxx.apps.googleusercontent.com" value="${esc(g.clientId)}" autocomplete="off" spellcheck="false" /></div>
        <ol style="padding-left:18px;margin:12px 0 0">
          <li>Sur console.cloud.google.com, crée un projet et active la <strong>Google Health API</strong>.</li>
          <li>Écran de consentement OAuth : type « Externe », ajoute ton adresse Gmail comme utilisateur test, et les accès <code>googlehealth.sleep.readonly</code>, <code>googlehealth.health_metrics_and_measurements.readonly</code> et <code>googlehealth.activity_and_fitness.readonly</code>.</li>
          <li>Identifiants → Créer un ID client OAuth → « Application Web ». Origine JavaScript autorisée : <code>${esc(location.origin)}</code>.</li>
          <li>Colle l'ID ci-dessus puis appuie sur Connecter.</li>
        </ol>
      </details>
    </section>

    <div class="section-title"><h3>Données</h3></div>
    <section class="card grid-2">
      <button class="btn" data-action="export">Exporter</button>
      <label class="btn" style="cursor:pointer">Importer<input type="file" accept="application/json" id="import-file" hidden /></label>
      <button class="btn danger" data-action="reset" style="grid-column:1/-1">Tout effacer</button>
    </section>`;
}

// ═════════════════════════ Onboarding

const onb = { step: 0, data: { name: "", sex: "m", age: 30, height: 178, weight: 82, level: "intermediate", days: 3, trainDays: [1, 3, 5], duration: 60, equip: "gym", sleepTarget: 7.5 } };

function renderOnboarding() {
  const d = onb.data;
  const opt = (field, v, title, sub) => `<button class="option" data-action="onb-set" data-field="${field}" data-val="${v}" aria-pressed="${String(d[field]) === String(v)}"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</button>`;
  const steps = [
    () => `
      <svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--card)" stroke="var(--line)"/><path d="M38 18a14 14 0 1 0 8 25 16 16 0 0 1-8-25z" fill="var(--c-recovery)"/><path d="M18 40h28M22 36v8M42 36v8" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"/></svg>
      <h1>Un coach qui lit ton sommeil.</h1>
      <p class="lead">Chaque matin, ta séance s'adapte à ta nuit : intense si tu as bien dormi, légère si la nuit a été courte. Objectif : perdre du gras et prendre du muscle.</p>
      <div class="field"><label for="onb-name">Comment tu t'appelles ?</label><input class="input" id="onb-name" data-onb="name" maxlength="40" value="${esc(d.name)}" placeholder="Ton prénom" autocomplete="given-name" /></div>`,
    () => `
      <h1>Ton gabarit</h1><p class="lead">Pour calculer tes besoins en calories et protéines.</p>
      <div class="field"><span class="label">Sexe</span><div class="segmented">
        ${[["m", "Homme"], ["f", "Femme"]].map(([v, l]) => `<button data-action="onb-set" data-field="sex" data-val="${v}" aria-pressed="${d.sex === v}">${l}</button>`).join("")}
      </div></div>
      <div class="field"><label for="o-age">Âge</label><input class="input" id="o-age" type="number" inputmode="numeric" min="14" max="90" data-onb="age" value="${d.age}" /></div>
      <div class="grid-2 field-grid">
        <div class="field"><label for="o-h">Taille (cm)</label><input class="input" id="o-h" type="number" inputmode="numeric" min="120" max="230" data-onb="height" value="${d.height}" /></div>
        <div class="field"><label for="o-w">Poids (kg)</label><input class="input" id="o-w" type="number" inputmode="decimal" step="0.1" min="30" max="300" data-onb="weight" value="${d.weight}" /></div>
      </div>`,
    () => `
      <h1>Ton niveau</h1><p class="lead">On ajuste le volume et la complexité des exercices.</p>
      <div class="option-list">
        ${opt("level", "beginner", "Débutant", "Moins de 6 mois de musculation régulière")}
        ${opt("level", "intermediate", "Intermédiaire", "Je connais les mouvements de base")}
        ${opt("level", "advanced", "Confirmé", "Plusieurs années d'entraînement")}
      </div>`,
    () => `
      <h1>Ton rythme</h1><p class="lead">Choisis tes jours d'entraînement. Mieux vaut un rythme tenable qu'un programme parfait abandonné.</p>
      ${dayChips(d.trainDays, "onb-day")}
      <p class="small muted" style="margin:12px 0 0">${d.trainDays.length} séances par semaine · ${d.trainDays.length >= 4 ? "Haut / Bas : plus de volume par muscle" : "Full body : le plus efficace pour la recomposition"}. Les autres jours sont des jours de récupération.</p>
      <div class="field" style="margin-top:24px"><span class="label">Temps par séance</span><div class="segmented">
        ${[45, 60, 75].map((v) => `<button data-action="onb-set" data-field="duration" data-val="${v}" aria-pressed="${d.duration === v}">${v} min</button>`).join("")}
      </div></div>`,
    () => `
      <h1>Ton matériel</h1><p class="lead">Les exercices sont choisis selon ce que tu as sous la main.</p>
      <div class="option-list">
        ${opt("equip", "gym", "Salle de sport", "Barres, machines, poulies")}
        ${opt("equip", "db", "Haltères à la maison", "Haltères réglables et un banc")}
        ${opt("equip", "bw", "Poids du corps", "Aucun matériel, juste une barre ou une table solide")}
      </div>`,
    () => `
      <h1>Ton sommeil</h1><p class="lead">Combien d'heures te faut-il pour te sentir vraiment reposé ?</p>
      <div class="option-list">
        ${[[7, "7 heures"], [7.5, "7 h 30"], [8, "8 heures"], [8.5, "8 h 30"]].map(([v, l]) => opt("sleepTarget", v, l, "")).join("")}
      </div>
      <p class="small muted" style="margin-top:20px">Tu pourras connecter Google Health depuis ton profil pour importer tes nuits, ta variabilité cardiaque, tes pas et ton poids automatiquement. Sans montre, une saisie rapide chaque matin suffit.</p>`,
  ];
  const last = onb.step === steps.length - 1;
  $app.innerHTML = `
    <div class="onb">
      <div class="onb-progress">${steps.map((_, i) => `<i class="${i <= onb.step ? "on" : ""}"></i>`).join("")}</div>
      <div class="grow">${steps[onb.step]()}</div>
      <div class="row" style="margin-top:32px">
        ${onb.step ? `<button class="btn ghost" data-action="onb-back">Retour</button>` : ""}
        <button class="btn primary grow" data-action="onb-next">${last ? "C'est parti" : "Continuer"}</button>
      </div>
    </div>`;
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
  return {
    id: e.id, name: e.name, cue: e.cue, timed: e.timed, bw: e.bw, rest: e.rest, rpe: e.rpe, repsTarget: e.reps, hint: e.hint,
    // Charge proposée, mais répétitions et RPE vides : seules les valeurs réellement saisies comptent
    sets: Array.from({ length: e.sets }, () => ({ weight: e.suggested, reps: null, rpe: null, done: false })),
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
          startedAt: Date.now(), lastActivity: Date.now(),
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
        sets: e.sets.map((x) => ({ weight: Number(x.weight) || 0, reps: Number(x.reps) || 0, rpe: x.rpe != null ? Number(x.rpe) : null, done: x.done })),
      })),
    });
    st.sessions.sort((x, y) => y.date.localeCompare(x.date));
    st.active = null;
  });
  stopRest();
  toast(stale ? "Séance enregistrée" : "Bien joué ! Séance enregistrée 💪");
  go("today");
}

// ═════════════════════════ Minuteurs et écran allumé

let restEnd = 0, restTimer = null, elapsedTimer = null, wakeLock = null;

function startRest(sec) {
  restEnd = Date.now() + sec * 1000;
  clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250);
  tickRest();
  document.getElementById("rest-bar")?.classList.add("show");
}
function tickRest() {
  if (!restTimer) return;
  const left = Math.max(0, Math.round((restEnd - Date.now()) / 1000));
  const el = document.getElementById("rest-t");
  if (el) el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
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
});

function afterRender(r) {
  // Animation de l'anneau depuis la valeur précédente
  requestAnimationFrame(() => document.querySelectorAll(".ring .val").forEach((c) => c.setAttribute("stroke-dashoffset", c.dataset.target)));
  if (r === "today" && ringScore != null) ringFrom = ringScore;
  if (r === "workout") {
    const a = store.get().active;
    clearInterval(elapsedTimer);
    const tick = () => {
      const sec = Math.floor((Date.now() - a.startedAt) / 1000);
      const el = document.getElementById("elapsed");
      if (el) el.textContent = sec >= 3600 ? `${Math.floor(sec / 3600)}h${String(Math.floor(sec / 60) % 60).padStart(2, "0")}` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    };
    tick();
    elapsedTimer = setInterval(tick, 1000);
    keepAwake(true);
    if (restTimer) { document.getElementById("rest-bar")?.classList.add("show"); tickRest(); }
  }
  if (r === "today") autoSync();
}

// ═════════════════════════ Google Health

let syncing = false;
async function syncGoogle({ interactive = true } = {}) {
  const s = store.get();
  if (syncing) return;
  if (!s.google.clientId) {
    if (interactive) { toast("Ajoute d'abord ton Client ID Google"); go("profile"); }
    return;
  }
  syncing = true;
  try {
    // Déjà autorisé une fois : pas besoin de réafficher l'écran de consentement
    if (interactive) await gh.authorize(s.google.clientId, { silent: s.google.connected });
    const data = await gh.fetchAll(s.google.clientId);
    const today = dateKey();
    store.update((st) => {
      // Les saisies manuelles restent prioritaires si l'utilisateur les a corrigées
      for (const [k, v] of Object.entries(data.nights)) if (!(st.nights[k]?.source === "manual" && st.nights[k].edited)) st.nights[k] = v;
      // Seules les valeurs reçues remplacent les anciennes : une donnée absente ne efface rien
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
  }
}

function autoSync() {
  const s = store.get();
  // Synchro silencieuse seulement si un jeton valide existe (pas de popup imprévue)
  if (s.google.connected && gh.hasToken() && Date.now() - (s.google.lastSync || 0) > 15 * 60_000) {
    syncGoogle({ interactive: false });
  }
}

// ═════════════════════════ Panneaux (sheets)

let sheetOpener = null;

function openSheet(html, onMount) {
  sheetOpener = document.activeElement;
  $sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grab"></div>${html}</div>`;
  const sheet = $sheetRoot.querySelector(".sheet");
  onMount?.(sheet);
  if (!sheet.contains(document.activeElement)) sheet.querySelector("button, input, [tabindex]")?.focus();
}
function closeSheet() {
  if (!$sheetRoot.innerHTML) return;
  $sheetRoot.innerHTML = "";
  sheetOpener?.focus?.();
  sheetOpener = null;
}

function sleepSheet() {
  const s = store.get();
  const cur = s.nights[dateKey()];
  let hours = cur?.hours ? Math.round(cur.hours * 4) / 4 : s.profile.sleepTarget;
  let quality = cur?.quality ?? 3;
  openSheet(`
    <h2 id="sheet-title">Ta nuit</h2>
    <p class="muted small" style="margin:0 0 20px">Combien de temps as-tu vraiment dormi ?</p>
    <div class="stepper">
      <button class="icon-btn" data-sh="minus" aria-label="Moins 15 minutes">−</button>
      <div class="val" id="sh-hours" aria-live="polite">${fmtHours(hours)}</div>
      <button class="icon-btn" data-sh="plus" aria-label="Plus 15 minutes">+</button>
    </div>
    <div class="field" style="margin-top:24px"><span class="label">Qualité ressentie</span>
      <div class="scale" id="sh-q" role="group" aria-label="Qualité ressentie">${[1, 2, 3, 4, 5].map((v) => `<button class="chip" data-q="${v}" aria-pressed="${v === quality}" aria-label="Qualité ${v} sur 5">${v}</button>`).join("")}</div>
      <div class="scale-labels"><span>Agitée</span><span>Réparatrice</span></div>
    </div>
    <button class="btn primary block" style="margin-top:24px" data-sh="save">Enregistrer</button>`,
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
    <p class="muted small" style="margin:0 0 20px">Le matin, à jeun, après être passé aux toilettes.</p>
    <div class="field"><label for="w-in">Poids (kg)</label><input class="input" id="w-in" type="number" inputmode="decimal" step="0.1" value="${s.weights[0]?.kg ?? s.profile.weight}" /></div>
    <button class="btn primary block" style="margin-top:20px" id="w-save">Enregistrer</button>`,
    (el) => {
      const inp = el.querySelector("#w-in");
      inp.focus(); inp.select();
      el.querySelector("#w-save").addEventListener("click", () => {
        const kg = Math.round(parseFloat(inp.value.replace(",", ".")) * 10) / 10;
        if (!kg || kg < 30 || kg > 300) return toast("Poids invalide (entre 30 et 300 kg)");
        store.update((st) => {
          const prev = st.weights.find((w) => w.date === dateKey());
          st.weights = st.weights.filter((w) => w.date !== dateKey());
          st.weights.unshift({ date: dateKey(), kg, ...(prev?.fatPct != null ? { fatPct: prev.fatPct } : {}), source: "manual" });
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
  if (!alts.length) return toast("Pas d'alternative disponible avec ton matériel");
  openSheet(`
    <h2 id="sheet-title">Remplacer</h2>
    <p class="muted small" style="margin:0 0 16px">${esc(ex.name)} — machine prise ou gêne ? Choisis un mouvement équivalent.</p>
    <div class="option-list">${alts.map((id) => `<button class="option" data-alt="${id}"><strong>${esc(EXERCISES[id].name)}</strong><span>${esc(EXERCISES[id].cue)}</span></button>`).join("")}</div>`,
    (el) => el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-alt]");
      if (!b) return;
      // Nouvelle prescription complète (séries, fourchette, repos, RPE, charge) pour le niveau de la séance
      const fresh = activeExercise(exerciseEntry(b.dataset.alt, { level: s.active.level, profile: s.profile, history: s.sessions }));
      store.update((st) => {
        const old = st.active.exercises[ei];
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
    }));
}

function historySheet(i) {
  const x = store.get().sessions[i];
  if (!x) return;
  const d = new Date(x.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  openSheet(`
    <h2 id="sheet-title">${esc(x.title)}</h2>
    <p class="muted small" style="margin:0 0 16px">${esc(d)} · ${INTENSITY[x.level].label} · ${x.minutes} min${x.readiness != null ? ` · forme ${x.readiness}` : ""}</p>
    ${x.exercises?.length ? `<ul class="ex-list detail">${x.exercises.map((e) => {
      const sets = e.sets.filter((y) => y.done);
      return `<li><span>${esc(e.name || EXERCISES[e.id]?.name || e.id)}</span><span class="sets">${sets.length ? sets.map((y) => `${y.weight ? String(y.weight).replace(".", ",") + "×" : ""}${y.reps}${y.rpe ? ` @${y.rpe}` : ""}`).join(" · ") : "non fait"}</span></li>`;
    }).join("")}</ul>` : `<p class="small muted">Séance de récupération.</p>`}
    ${x.finisher ? `<p class="small muted">${esc(x.finisher.name)} : ${x.finisher.done ? "fait" : "non fait"}</p>` : ""}
    <button class="btn block" style="margin-top:16px" data-action="close-sheet">Fermer</button>`);
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
      return renderOnboarding();
    }
    case "onb-day": {
      const days = toggleDay(onb.data.trainDays, Number(b.dataset.day));
      if (days) { onb.data.trainDays = days; onb.data.days = days.length; }
      return renderOnboarding();
    }
    case "onb-back": onb.step--; return renderOnboarding();
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
    case "checkin":
      return store.update((st) => {
        const c = (st.checkins[dateKey()] ||= {});
        const v = Number(b.dataset.val);
        if (c[b.dataset.key] === v) delete c[b.dataset.key]; else c[b.dataset.key] = v;
      });
    case "override":
      return store.update((st) => {
        const t = dateKey();
        if (b.dataset.level === autoLevel(st)) delete st.override[t]; else st.override[t] = b.dataset.level;
      });
    case "start": return startWorkout();
    case "leave-workout": return go("today");
    case "cancel-workout":
      if (confirm("Supprimer cette séance ? Rien ne sera enregistré.")) { store.update((st) => { st.active = null; }); stopRest(); go("today"); }
      return;
    case "finish": return finishWorkout();
    case "finish-stale": return finishWorkout({ stale: true });
    case "toggle-set": {
      const ei = +b.dataset.ei, si = +b.dataset.si;
      const cur = store.get().active.exercises[ei];
      const x0 = cur.sets[si];
      if (!x0.done && (x0.reps == null || x0.reps === "")) {
        toast(cur.timed ? "Indique la durée tenue avant de valider" : "Indique tes répétitions avant de valider");
        return document.querySelector(`input[data-field="reps"][data-ei="${ei}"][data-si="${si}"]`)?.focus();
      }
      let nowDone = false;
      store.update((st) => {
        const e = st.active.exercises[ei];
        const x = e.sets[si];
        x.done = !x.done;
        nowDone = x.done;
        st.active.lastActivity = Date.now();
        // Propage la charge aux séries suivantes non faites
        if (x.done && x.weight != null) e.sets.slice(si + 1).forEach((y) => { if (!y.done && (y.weight == null || y.weight === "")) y.weight = x.weight; });
      });
      if (nowDone) {
        navigator.vibrate?.(30);
        const e = store.get().active.exercises[ei];
        const exDone = e.sets.every((x) => x.done);
        const lastOfAll = exDone && ei === store.get().active.exercises.length - 1;
        if (!lastOfAll) startRest(e.rest);
        if (exDone) document.getElementById(`ex-${ei + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    case "rest-add": if (restTimer) { restEnd += 30_000; tickRest(); } return;
    case "rest-skip": return stopRest();
    case "add-weight": return weightSheet();
    case "history": return historySheet(+b.dataset.i);
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

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove("show"), 2600);
}

// Re-rendu à chaque changement d'état, sauf les saisies silencieuses de la séance
store.subscribe((_, silent) => { if (!silent) render(); });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
