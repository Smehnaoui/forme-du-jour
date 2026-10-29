import * as store from "./store.js";
import {
  readiness, buildSession, nextDayIndex, splitFor, nutrition, sleepScore,
  lastPerformance, INTENSITY, dateKey, fmtHours,
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
  check: `<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>`,
  swap: `<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>`,
  sync: `<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
};

// ═════════════════════════ Routage

function route() {
  return (location.hash.replace(/^#\/?/, "") || "today").split("?")[0];
}

function render() {
  const s = store.get();
  stopRestIfLeaving();
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
  $tabbar.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.tab === r));
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

function todayPlan(s) {
  const today = dateKey();
  const night = s.nights[today] || null;
  const checkin = s.checkins[today] || null;
  const r = readiness({ night, recentNights: recentNights(s), checkin, profile: s.profile, recentSessions: s.sessions });
  const level = s.override[today] || r.level;
  const split = splitFor(s.profile);
  const lifted = s.sessions.filter((x) => x.level !== "recovery").length;
  const session = buildSession({
    profile: s.profile, level,
    dayIndex: nextDayIndex(s.profile, s.sessions),
    history: s.sessions,
    cycle: Math.floor(lifted / (split.length * 4)), // nouvelles variantes toutes les ~4 semaines
  });
  const doneToday = s.sessions.find((x) => x.date === today);
  return { today, night, checkin, r, level, session, doneToday };
}

// ═════════════════════════ Vue : Aujourd'hui

function viewToday(s) {
  const p = todayPlan(s);
  const { r, level, session, night, checkin, doneToday } = p;
  const lvl = INTENSITY[level];
  const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Salut" : "Bonsoir";
  const latestW = s.weights[0]?.kg;
  const nut = nutrition(s.profile, latestW);
  const C = 2 * Math.PI * 50;

  const sleepBlock = night ? `
    <div class="sleep-stats">
      <div class="stat"><div class="v">${fmtHours(night.hours)}</div><div class="k">Sommeil</div></div>
      <div class="stat"><div class="v">${night.efficiency != null ? Math.round(night.efficiency) + "%" : (night.quality ?? "–") + "/5"}</div><div class="k">${night.efficiency != null ? "Efficacité" : "Qualité"}</div></div>
      <div class="stat"><div class="v">${night.deepMin != null ? fmtHours((night.deepMin + night.remMin) / 60) : r.sleep ? r.sleep.score : "–"}</div><div class="k">${night.deepMin != null ? "Profond+REM" : "Note nuit"}</div></div>
    </div>
    <div class="row between" style="margin-top:12px">
      <span class="pill">${night.source === "google" ? "Google Health" : "Saisie manuelle"}</span>
      <button class="link-btn" data-action="edit-sleep">Corriger</button>
    </div>` : `
    <div class="empty-sleep">
      ${s.google.clientId ? `<button class="btn primary block" data-action="sync">${ICON.sync} Récupérer ma nuit (Google)</button>` : ""}
      <button class="btn ${s.google.clientId ? "" : "primary"} block" data-action="edit-sleep">${ICON.moon} Saisir ma nuit</button>
    </div>`;

  const scale = (key, val, lo, hi) => `
    <div class="scale" role="group">
      ${[1, 2, 3, 4, 5].map((v) => `<button class="chip" data-action="checkin" data-key="${key}" data-val="${v}" aria-pressed="${val === v}">${v}</button>`).join("")}
    </div>
    <div class="scale-labels"><span>${lo}</span><span>${hi}</span></div>`;

  const sessionBlock = doneToday ? `
    <div class="card done-card" data-lvl="${doneToday.level}">
      <div class="big">✓</div>
      <h2>Séance faite</h2>
      <p class="muted small">${esc(doneToday.title)} · ${doneToday.minutes} min${doneToday.volume ? ` · ${Math.round(doneToday.volume).toLocaleString("fr-FR")} kg soulevés` : ""}</p>
      <p class="muted small">Pense à atteindre tes ${nut.protein} g de protéines et à te coucher tôt ce soir.</p>
    </div>` : `
    <div class="card session-card" data-lvl="${level}">
      <div class="row between">
        <span class="eyebrow">Séance proposée</span>
        <span class="pill" style="color:var(--lvl)"><span class="dot"></span>${lvl.short}</span>
      </div>
      <h2 style="margin-top:8px">${esc(session.title)}</h2>
      <div class="session-meta">
        <span>${ICON.clock} ~${session.minutes} min</span>
        <span>${ICON.list} ${session.recovery ? session.items.length + " étapes" : session.exercises.length + " exercices"}</span>
        <span>${ICON.bolt} ${esc(session.focus)}</span>
      </div>
      <div class="note">${esc(session.note)}</div>
      <ul class="ex-list">
        ${session.recovery
          ? session.items.map((it) => `<li><span>${esc(it.name)}</span><span class="sets">${esc(it.detail.split(",")[0])}</span></li>`).join("")
          : session.exercises.map((e) => `<li><span>${esc(e.name)}</span><span class="sets">${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.timed ? " s" : ""}${e.suggested ? ` · ${e.suggested} kg` : ""}</span></li>`).join("")
            + `<li><span>${esc(session.finisher.name)}</span><span class="sets">bonus</span></li>`}
      </ul>
      <button class="btn primary block" data-action="start">${s.active ? "Reprendre la séance" : "Commencer"}</button>
      <div style="margin-top:14px">
        <div class="eyebrow" style="margin-bottom:8px">Ajuster l'intensité</div>
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

    <section class="card readiness" data-lvl="${level}">
      <div class="readiness-top">
        <div class="ring" aria-label="Score de forme ${r.score} sur 100">
          <svg viewBox="0 0 120 120">
            <circle class="track" cx="60" cy="60" r="50" fill="none" stroke-width="12"/>
            <circle class="val" cx="60" cy="60" r="50" fill="none" stroke-width="12"
              stroke-dasharray="${C}" stroke-dashoffset="${C}" data-target="${C * (1 - r.score / 100)}"/>
          </svg>
          <div class="center"><div><div class="score">${r.score}</div><div class="of">FORME</div></div></div>
        </div>
        <div class="grow">
          <div class="eyebrow">Ta forme aujourd'hui</div>
          <div class="level-name">${lvl.label}</div>
          ${s.override[p.today] && s.override[p.today] !== r.level ? `<div class="small muted">Intensité choisie manuellement</div>` : ""}
        </div>
      </div>
      <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${sleepBlock}
    </section>

    <div class="section-title"><h3>Ton ressenti</h3><span class="small muted">Affine la séance</span></div>
    <section class="card stack">
      <div><div class="small" style="font-weight:700;margin-bottom:8px">Énergie</div>${scale("energy", checkin?.energy, "Vidé", "Au top")}</div>
      <div><div class="small" style="font-weight:700;margin-bottom:8px">Courbatures</div>${scale("soreness", checkin?.soreness, "Aucune", "Fortes")}</div>
    </section>

    <div class="section-title"><h3>Entraînement</h3></div>
    ${sessionBlock}

    <div class="section-title"><h3>Nutrition du jour</h3><span class="small muted">Recomposition</span></div>
    <section class="nutri">
      <div class="stat card flat"><div class="v num">${nut.target.toLocaleString("fr-FR")}</div><div class="k">kcal cible</div></div>
      <div class="stat card flat"><div class="v num">${nut.protein} g</div><div class="k">protéines</div></div>
      <div class="stat card flat"><div class="v num">${(nut.steps / 1000).toFixed(0)}k</div><div class="k">pas</div></div>
    </section>
    <p class="small muted" style="margin:10px 4px 0">Léger déficit (~400 kcal sous ta maintenance de ${nut.tdee.toLocaleString("fr-FR")} kcal) + beaucoup de protéines : tu perds du gras en construisant du muscle.</p>
  `;
}

// ═════════════════════════ Vue : Séance en cours

function viewWorkout(s) {
  const a = s.active;
  const total = a.recovery ? a.items.length : a.exercises.reduce((t, e) => t + e.sets.length, 0);
  const done = a.recovery ? a.items.filter((i) => i.done).length : a.exercises.reduce((t, e) => t + e.sets.filter((x) => x.done).length, 0);

  const body = a.recovery
    ? `<section class="card">
        ${a.items.map((it, i) => `
          <div class="set-row ${it.done ? "is-done" : ""}" style="grid-template-columns:1fr 52px;padding:6px 0">
            <div><div style="font-weight:700">${esc(it.name)}</div><div class="small muted">${esc(it.detail)}</div></div>
            <button class="check" data-action="toggle-item" data-i="${i}" aria-label="Valider">${ICON.check}</button>
          </div>`).join("")}
      </section>`
    : a.exercises.map((e, ei) => {
        const exDone = e.sets.every((x) => x.done);
        const last = lastPerformance(e.id, s.sessions);
        const lastTxt = last ? last.sets.filter((x) => x.done).map((x) => `${x.weight || "PDC"}×${x.reps}`).join(" · ") : null;
        return `
        <section class="card ex-card ${exDone ? "done" : ""}" id="ex-${ei}">
          <div class="row between">
            <div class="grow">
              <div class="eyebrow">${ei + 1}/${a.exercises.length} · ${e.repsTarget[0]}–${e.repsTarget[1]}${e.timed ? " s" : " reps"} · RPE ${e.rpe}</div>
              <h3 style="margin-top:4px">${esc(e.name)}</h3>
            </div>
            <button class="icon-btn" data-action="swap" data-ei="${ei}" aria-label="Changer d'exercice">${ICON.swap}</button>
          </div>
          <div class="cue">${esc(e.cue)}</div>
          <div class="set-head"><span>#</span><span>${e.timed ? "—" : "Kg"}</span><span>${e.timed ? "Sec." : "Reps"}</span><span></span></div>
          ${e.sets.map((x, si) => `
            <div class="set-row ${x.done ? "is-done" : ""}">
              <span class="idx">${si + 1}</span>
              <input type="number" inputmode="decimal" step="0.5" min="0" value="${x.weight ?? ""}" placeholder="${e.timed ? "—" : "0"}" ${e.timed ? "disabled" : ""}
                data-field="weight" data-ei="${ei}" data-si="${si}" aria-label="Charge série ${si + 1}" />
              <input type="number" inputmode="numeric" min="0" value="${x.reps ?? ""}" placeholder="${e.repsTarget[1]}"
                data-field="reps" data-ei="${ei}" data-si="${si}" aria-label="Répétitions série ${si + 1}" />
              <button class="check" data-action="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Valider la série ${si + 1}">${ICON.check}</button>
            </div>`).join("")}
          <div class="row between" style="margin-top:10px">
            <span class="last-time" style="margin:0">${lastTxt ? `Dernière fois : ${lastTxt}` : "Première fois : trouve une charge où tu gardes 2–3 reps en réserve"}</span>
            <button class="link-btn" data-action="add-set" data-ei="${ei}">+ série</button>
          </div>
        </section>`;
      }).join("") + `
        <section class="card finisher">
          <div class="row between">
            <div class="grow"><div class="eyebrow">Bonus brûle-graisse</div><h3 style="margin-top:4px">${esc(a.finisher.name)}</h3><div class="small muted">${esc(a.finisher.detail)}</div></div>
            <button class="check" style="${a.finisherDone ? "background:var(--lvl);border-color:transparent" : ""}" data-action="toggle-finisher" aria-label="Valider le bonus">${ICON.check}</button>
          </div>
        </section>`;

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
      <div class="progress-bar"><i style="width:${(done / total) * 100}%"></i></div>
    </div>
    <div data-lvl="${a.level}" class="stack">${body}</div>
    <div class="bottom-action"><div class="inner">
      <button class="btn ghost" data-action="cancel-workout">Abandonner</button>
      <button class="btn primary grow" data-action="finish">Terminer la séance</button>
    </div></div>
    <div class="rest-bar" id="rest-bar">
      <div class="t" id="rest-t">0:00</div><div class="lbl">Repos</div>
      <button data-action="rest-add">+30 s</button><button data-action="rest-skip">Passer</button>
    </div>`;
}

// ═════════════════════════ Vue : Programme

function viewProgram(s) {
  const split = splitFor(s.profile);
  const next = nextDayIndex(s.profile, s.sessions);
  const equipName = { gym: "Salle de sport", db: "Haltères à la maison", bw: "Poids du corps" }[s.profile.equip];
  return `
    <header class="page-head"><div><div class="eyebrow">${split.length} séances / semaine · ${esc(equipName)}</div><h1>Ton programme</h1></div></header>
    <p class="muted" style="margin:-6px 4px 20px">${split.length === 3 ? "Full body 3×/semaine : chaque muscle est travaillé souvent, idéal pour perdre du gras tout en prenant du muscle." : "Haut / Bas 4×/semaine : plus de volume par muscle, parfait pour progresser en recomposition."}</p>
    ${split.map((day, i) => {
      const sess = buildSession({ profile: s.profile, level: "normal", dayIndex: i, history: s.sessions });
      return `
      <section class="card" ${i === next ? 'data-lvl="normal" style="border-color:var(--c-normal)"' : ""}>
        <div class="row between">
          <div><div class="eyebrow">Jour ${i + 1}${i === next ? " · prochaine séance" : ""}</div><h3 style="margin-top:4px">${esc(day.name)}</h3></div>
          <span class="small muted">${esc(day.focus)}</span>
        </div>
        <ul class="ex-list" style="margin:12px 0 0">
          ${sess.exercises.map((e) => `<li><span>${esc(e.name)}</span><span class="sets">${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.timed ? " s" : ""}</span></li>`).join("")}
        </ul>
      </section>`;
    }).join("")}

    <div class="section-title"><h3>Comment ça s'adapte</h3></div>
    <section class="card">
      ${[
        ["full", "75 et +", "Séries lourdes (4 × 6–8), RPE 8 et finisher en intervalles."],
        ["normal", "52 – 74", "Séance standard (3 × 8–10), RPE 7 et 15 min de cardio doux."],
        ["light", "32 – 51", "Version légère : charges −20 %, 2 séries, variantes guidées, aucune série à l'échec."],
        ["recovery", "moins de 32", "Pas de muscu : mobilité, marche et respiration pour récupérer."],
      ].map(([k, range, txt]) => `
        <div class="zone" data-lvl="${k}">
          <div class="bar"></div>
          <div><div style="font-weight:700">${INTENSITY[k].label} <span class="muted small">· score ${range}</span></div><div class="small muted">${txt}</div></div>
        </div>`).join("")}
    </section>
    <p class="small muted" style="margin:12px 4px">Le score combine ton sommeil (65 %), ton énergie (20 %) et tes courbatures (15 %). Une dette de sommeil sur 3 nuits ou 3 jours d'entraînement d'affilée plafonnent l'intensité. Les charges montent automatiquement quand tu atteins le haut de la fourchette sur toutes les séries.</p>
  `;
}

// ═════════════════════════ Vue : Progrès

function viewProgress(s) {
  const weekAgo = dateKey(new Date(Date.now() - 6 * 86400_000));
  const thisWeek = s.sessions.filter((x) => x.date >= weekAgo).length;
  const w = s.weights;
  const delta = w.length > 1 ? w[0].kg - w[w.length - 1].kg : null;

  return `
    <header class="page-head"><div><div class="eyebrow">Ton évolution</div><h1>Progrès</h1></div></header>
    <section class="grid-3">
      <div class="stat card flat"><div class="v num">${thisWeek}/${s.profile.days}</div><div class="k">séances (7 j)</div></div>
      <div class="stat card flat"><div class="v num">${s.sessions.length}</div><div class="k">au total</div></div>
      <div class="stat card flat"><div class="v num">${delta == null ? "–" : (delta > 0 ? "+" : "") + delta.toFixed(1)}</div><div class="k">kg depuis le début</div></div>
    </section>

    <div class="section-title"><h3>Poids</h3><button class="link-btn" data-action="add-weight">+ Ajouter une pesée</button></div>
    <section class="card">${w.length >= 2 ? weightChart(w) : `<p class="muted small" style="margin:0">Pèse-toi le matin à jeun, 2–3 fois par semaine. La tendance compte plus que le chiffre du jour.${w.length ? ` Dernière pesée : <strong>${w[0].kg} kg</strong>.` : ""}</p>`}</section>

    <div class="section-title"><h3>Sommeil · 14 nuits</h3><span class="small muted">objectif ${fmtHours(s.profile.sleepTarget)}</span></div>
    <section class="card">${sleepChart(s)}</section>

    <div class="section-title"><h3>Historique</h3></div>
    <section class="card">
      ${s.sessions.length ? s.sessions.slice(0, 20).map((x) => `
        <div class="history-item" data-lvl="${x.level}">
          <div class="badge">${new Date(x.date + "T12:00").getDate()}</div>
          <div class="grow">
            <div style="font-weight:700">${esc(x.title)}</div>
            <div class="small muted">${new Date(x.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${INTENSITY[x.level].short} · ${x.minutes} min${x.volume ? ` · ${Math.round(x.volume).toLocaleString("fr-FR")} kg` : ""}</div>
          </div>
        </div>`).join("") : `<p class="muted small" style="margin:0">Tes séances terminées apparaîtront ici.</p>`}
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
  const lvlOf = (n) => { const sc = sleepScore(n, s.profile.sleepTarget).score; return sc >= 75 ? "full" : sc >= 52 ? "normal" : sc >= 32 ? "light" : "recovery"; };
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

function viewProfile(s) {
  const p = s.profile;
  const g = s.google;
  const seg = (field, opts, val) => `<div class="segmented">${opts.map(([v, l]) => `<button data-action="set-profile" data-field="${field}" data-val="${v}" aria-pressed="${String(val) === String(v)}">${l}</button>`).join("")}</div>`;
  return `
    <header class="page-head"><div><div class="eyebrow">Réglages</div><h1>Profil</h1></div></header>

    <section class="card">
      <div class="field"><label for="pf-name">Prénom</label><input class="input" id="pf-name" data-profile="name" value="${esc(p.name)}" /></div>
      <div class="grid-3" style="margin-top:18px">
        <div class="field"><label for="pf-age">Âge</label><input class="input" id="pf-age" type="number" inputmode="numeric" data-profile="age" value="${p.age}" /></div>
        <div class="field" style="margin:0"><label for="pf-h">Taille (cm)</label><input class="input" id="pf-h" type="number" inputmode="numeric" data-profile="height" value="${p.height}" /></div>
        <div class="field" style="margin:0"><label for="pf-w">Poids (kg)</label><input class="input" id="pf-w" type="number" inputmode="decimal" data-profile="weight" value="${p.weight}" /></div>
      </div>
      <div class="field"><span class="label">Sexe</span>${seg("sex", [["m", "Homme"], ["f", "Femme"]], p.sex)}</div>
      <div class="field"><span class="label">Niveau</span>${seg("level", [["beginner", "Débutant"], ["intermediate", "Intermédiaire"], ["advanced", "Confirmé"]], p.level)}</div>
      <div class="field"><span class="label">Séances par semaine</span>${seg("days", [[3, "3 (full body)"], [4, "4 (haut/bas)"]], p.days)}</div>
      <div class="field"><span class="label">Durée</span>${seg("duration", [[45, "45 min"], [60, "60 min"], [75, "75 min"]], p.duration)}</div>
      <div class="field"><span class="label">Équipement</span>${seg("equip", [["gym", "Salle"], ["db", "Haltères"], ["bw", "Poids du corps"]], p.equip)}</div>
      <div class="field"><span class="label">Objectif de sommeil</span>${seg("sleepTarget", [[7, "7h"], [7.5, "7h30"], [8, "8h"], [8.5, "8h30"]], p.sleepTarget)}</div>
    </section>

    <div class="section-title"><h3>Google Health</h3><span class="pill" style="${g.connected ? "color:var(--c-full)" : ""}"><span class="dot"></span>${g.connected ? "Connecté" : "Non connecté"}</span></div>
    <section class="card stack">
      <p class="small muted" style="margin:0">Ton sommeil (durée, efficacité, phases profond/paradoxal) est lu en lecture seule depuis la Google Health API. Les données restent sur ton téléphone.</p>
      <div class="field"><label for="g-client">Client ID OAuth Google</label><input class="input" id="g-client" placeholder="xxxx.apps.googleusercontent.com" value="${esc(g.clientId)}" autocomplete="off" spellcheck="false" /></div>
      ${g.lastSync ? `<div class="small muted">Dernière synchro : ${new Date(g.lastSync).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>` : ""}
      <div class="grid-2">
        <button class="btn primary" data-action="sync">${ICON.sync} ${g.connected ? "Synchroniser" : "Connecter"}</button>
        ${g.connected ? `<button class="btn ghost" data-action="disconnect">Déconnecter</button>` : `<button class="btn ghost" data-action="demo-sleep">Nuits de démo</button>`}
      </div>
      <details class="small muted"><summary style="cursor:pointer;font-weight:700">Comment obtenir un Client ID ?</summary>
        <ol style="padding-left:18px;margin:10px 0 0">
          <li>Sur console.cloud.google.com, crée un projet et active la <strong>Google Health API</strong>.</li>
          <li>Écran de consentement OAuth : type « Externe », ajoute ton adresse Gmail comme utilisateur test, et le scope <code>googlehealth.sleep.readonly</code>.</li>
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

const onb = { step: 0, data: { name: "", sex: "m", age: 30, height: 178, weight: 82, level: "intermediate", days: 3, duration: 60, equip: "gym", sleepTarget: 7.5 } };

function renderOnboarding() {
  const d = onb.data;
  const opt = (field, v, title, sub) => `<button class="option" data-action="onb-set" data-field="${field}" data-val="${v}" aria-pressed="${String(d[field]) === String(v)}"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</button>`;
  const steps = [
    () => `
      <svg class="hero-mark" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="var(--card)" stroke="var(--line)"/><path d="M38 18a14 14 0 1 0 8 25 16 16 0 0 1-8-25z" fill="var(--c-recovery)"/><path d="M18 40h28M22 36v8M42 36v8" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"/></svg>
      <h1>Un coach qui lit ton sommeil.</h1>
      <p class="lead">Chaque matin, ta séance s'adapte à ta nuit : intense si tu as bien dormi, légère si la nuit a été courte. Objectif : perdre du gras et prendre du muscle.</p>
      <div class="field"><label for="onb-name">Comment tu t'appelles ?</label><input class="input" id="onb-name" data-onb="name" value="${esc(d.name)}" placeholder="Ton prénom" autocomplete="given-name" /></div>`,
    () => `
      <h1>Ton gabarit</h1><p class="lead">Pour calculer tes besoins en calories et protéines.</p>
      <div class="field"><span class="label">Sexe</span><div class="segmented">
        ${[["m", "Homme"], ["f", "Femme"]].map(([v, l]) => `<button data-action="onb-set" data-field="sex" data-val="${v}" aria-pressed="${d.sex === v}">${l}</button>`).join("")}
      </div></div>
      <div class="field"><label for="o-age">Âge</label><input class="input" id="o-age" type="number" inputmode="numeric" data-onb="age" value="${d.age}" /></div>
      <div class="grid-2" style="margin-top:18px">
        <div class="field"><label for="o-h">Taille (cm)</label><input class="input" id="o-h" type="number" inputmode="numeric" data-onb="height" value="${d.height}" /></div>
        <div class="field" style="margin:0"><label for="o-w">Poids (kg)</label><input class="input" id="o-w" type="number" inputmode="decimal" step="0.1" data-onb="weight" value="${d.weight}" /></div>
      </div>`,
    () => `
      <h1>Ton niveau</h1><p class="lead">On ajuste le volume et la complexité des exercices.</p>
      <div class="option-list">
        ${opt("level", "beginner", "Débutant", "Moins de 6 mois de musculation régulière")}
        ${opt("level", "intermediate", "Intermédiaire", "Je connais les mouvements de base")}
        ${opt("level", "advanced", "Confirmé", "Plusieurs années d'entraînement")}
      </div>`,
    () => `
      <h1>Ton rythme</h1><p class="lead">Mieux vaut un rythme tenable sur la durée qu'un programme parfait abandonné.</p>
      <div class="option-list">
        ${opt("days", 3, "3 séances / semaine", "Full body — le plus efficace pour la recomposition")}
        ${opt("days", 4, "4 séances / semaine", "Haut / Bas — plus de volume par muscle")}
      </div>
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
      <p class="small muted" style="margin-top:20px">Tu pourras connecter Google Health depuis ton profil pour importer tes nuits automatiquement. Sinon, une saisie rapide chaque matin suffit.</p>`,
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

// ═════════════════════════ Séance : démarrer / terminer

function startWorkout() {
  const s = store.get();
  if (s.active) return go("workout");
  const { session, r } = todayPlan(s);
  store.update((st) => {
    st.active = session.recovery
      ? { date: dateKey(), level: session.level, title: session.title, recovery: true, readiness: r.score, startedAt: Date.now(),
          items: session.items.map((it) => ({ ...it, done: false })) }
      : {
          date: dateKey(), level: session.level, dayIndex: session.dayIndex, title: session.title, readiness: r.score, startedAt: Date.now(),
          finisher: session.finisher, finisherDone: false,
          exercises: session.exercises.map((e) => ({
            id: e.id, name: e.name, cue: e.cue, timed: e.timed, rest: e.rest, rpe: e.rpe, repsTarget: e.reps,
            sets: Array.from({ length: e.sets }, () => ({ weight: e.suggested, reps: e.reps[1], done: false })),
          })),
        };
  });
  go("workout");
}

function finishWorkout() {
  const s = store.get();
  const a = s.active;
  const anyDone = a.recovery ? a.items.some((i) => i.done) : a.exercises.some((e) => e.sets.some((x) => x.done));
  if (!anyDone && !confirm("Aucune série validée. Terminer quand même ?")) return;
  const minutes = Math.max(1, Math.round((Date.now() - a.startedAt) / 60000));
  const volume = a.recovery ? 0 : a.exercises.reduce((t, e) => t + e.sets.filter((x) => x.done).reduce((u, x) => u + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0);
  store.update((st) => {
    st.sessions.unshift({
      date: a.date, level: a.level, dayIndex: a.recovery ? null : a.dayIndex, title: a.title, readiness: a.readiness, minutes, volume,
      exercises: a.recovery ? [] : a.exercises.map((e) => ({ id: e.id, repsTarget: e.repsTarget, sets: e.sets.map((x) => ({ weight: Number(x.weight) || 0, reps: Number(x.reps) || 0, done: x.done })) })),
    });
    st.active = null;
  });
  stopRest();
  toast("Bien joué ! Séance enregistrée 💪");
  go("today");
}

// ═════════════════════════ Minuteurs

let restEnd = 0, restTimer = null, elapsedTimer = null;

function startRest(sec) {
  restEnd = Date.now() + sec * 1000;
  clearInterval(restTimer);
  tickRest();
  restTimer = setInterval(tickRest, 250);
  document.getElementById("rest-bar")?.classList.add("show");
}
function tickRest() {
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
function stopRestIfLeaving() {
  if (route() !== "workout") { stopRest(); clearInterval(elapsedTimer); }
}

function afterRender(r) {
  // Animation de l'anneau
  requestAnimationFrame(() => document.querySelectorAll(".ring .val").forEach((c) => c.setAttribute("stroke-dashoffset", c.dataset.target)));
  if (r === "workout") {
    const a = store.get().active;
    clearInterval(elapsedTimer);
    const tick = () => {
      const sec = Math.floor((Date.now() - a.startedAt) / 1000);
      const el = document.getElementById("elapsed");
      if (el) el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    };
    tick();
    elapsedTimer = setInterval(tick, 1000);
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
    const nights = await gh.fetchSleep(s.google.clientId, 14);
    const n = Object.keys(nights).length;
    store.update((st) => {
      // Les saisies manuelles du jour restent prioritaires si l'utilisateur les a corrigées
      for (const [k, v] of Object.entries(nights)) if (!(st.nights[k]?.source === "manual" && st.nights[k].edited)) st.nights[k] = v;
      st.google.connected = true;
      st.google.lastSync = Date.now();
    });
    if (interactive) toast(n ? `${n} nuit${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""} depuis Google` : "Aucune nuit trouvée sur 14 jours");
    render();
  } catch (e) {
    if (interactive) toast(e.message);
  } finally {
    syncing = false;
  }
}

function autoSync() {
  const s = store.get();
  // Synchro silencieuse seulement si un jeton valide existe (pas de popup imprévue)
  if (s.google.connected && gh.hasToken() && !s.nights[dateKey()] && Date.now() - (s.google.lastSync || 0) > 15 * 60_000) {
    syncGoogle({ interactive: false });
  }
}

function demoSleep() {
  const pattern = [5.2, 7.8, 6.4, 8.1, 7.2, 4.9, 7.6, 6.9, 8.3, 7.0, 6.1, 7.7, 7.4, 6.6];
  store.update((st) => {
    const d = new Date();
    pattern.forEach((h, i) => {
      const dd = new Date(d); dd.setDate(d.getDate() - i);
      st.nights[dateKey(dd)] = {
        hours: h, efficiency: 82 + (h - 6) * 4, deepMin: Math.round(h * 60 * 0.17), remMin: Math.round(h * 60 * 0.21), source: "manual",
      };
    });
  });
  toast("14 nuits de démo ajoutées");
}

// ═════════════════════════ Panneaux (sheets)

function openSheet(html, onMount) {
  $sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  onMount?.($sheetRoot.querySelector(".sheet"));
}
function closeSheet() { $sheetRoot.innerHTML = ""; }

function sleepSheet() {
  const s = store.get();
  const cur = s.nights[dateKey()];
  let hours = cur?.hours ? Math.round(cur.hours * 4) / 4 : s.profile.sleepTarget;
  let quality = cur?.quality ?? 3;
  openSheet(`
    <h2>Ta nuit</h2>
    <p class="muted small" style="margin:0 0 20px">Combien de temps as-tu vraiment dormi ?</p>
    <div class="stepper">
      <button class="icon-btn" data-sh="minus" aria-label="Moins">−</button>
      <div class="val" id="sh-hours">${fmtHours(hours)}</div>
      <button class="icon-btn" data-sh="plus" aria-label="Plus">+</button>
    </div>
    <div class="field" style="margin-top:24px"><span class="label">Qualité ressentie</span>
      <div class="scale" id="sh-q">${[1, 2, 3, 4, 5].map((v) => `<button class="chip" data-q="${v}" aria-pressed="${v === quality}">${v}</button>`).join("")}</div>
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
    <h2>Nouvelle pesée</h2>
    <p class="muted small" style="margin:0 0 20px">Le matin, à jeun, après être passé aux toilettes.</p>
    <div class="field"><label for="w-in">Poids (kg)</label><input class="input" id="w-in" type="number" inputmode="decimal" step="0.1" value="${s.weights[0]?.kg ?? s.profile.weight}" /></div>
    <button class="btn primary block" style="margin-top:20px" id="w-save">Enregistrer</button>`,
    (el) => {
      const inp = el.querySelector("#w-in");
      inp.focus(); inp.select();
      el.querySelector("#w-save").addEventListener("click", () => {
        const kg = Math.round(parseFloat(inp.value.replace(",", ".")) * 10) / 10;
        if (!kg || kg < 30 || kg > 300) return toast("Poids invalide");
        store.update((st) => {
          st.weights = st.weights.filter((w) => w.date !== dateKey());
          st.weights.unshift({ date: dateKey(), kg });
          st.weights.sort((a, b) => b.date.localeCompare(a.date));
          st.profile.weight = kg;
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
    <h2>Remplacer</h2>
    <p class="muted small" style="margin:0 0 16px">${esc(ex.name)} — machine prise ou gêne ? Choisis un mouvement équivalent.</p>
    <div class="option-list">${alts.map((id) => `<button class="option" data-alt="${id}"><strong>${esc(EXERCISES[id].name)}</strong><span>${esc(EXERCISES[id].cue)}</span></button>`).join("")}</div>`,
    (el) => el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-alt]");
      if (!b) return;
      const nx = EXERCISES[b.dataset.alt];
      const last = lastPerformance(b.dataset.alt, s.sessions);
      const w = last ? Math.max(...last.sets.map((x) => x.weight || 0)) || null : null;
      store.update((st) => {
        const e = st.active.exercises[ei];
        Object.assign(e, { id: b.dataset.alt, name: nx.name, cue: nx.cue, timed: !!nx.timed });
        e.sets.forEach((x) => { if (!x.done) x.weight = w; });
      });
      closeSheet();
    }));
}

// ═════════════════════════ Événements

$app.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-action]");
  if (!b) return;
  const s = store.get();
  const A = b.dataset.action;

  switch (A) {
    case "onb-set": {
      const v = b.dataset.val;
      onb.data[b.dataset.field] = isNaN(Number(v)) ? v : Number(v);
      return renderOnboarding();
    }
    case "onb-back": onb.step--; return renderOnboarding();
    case "onb-next": {
      if (onb.step < 5) { onb.step++; renderOnboarding(); return window.scrollTo({ top: 0 }); }
      const d = onb.data;
      store.update((st) => {
        st.profile = { ...d, name: d.name.trim() };
        st.weights = [{ date: dateKey(), kg: d.weight }];
      });
      return go("today");
    }
    case "edit-sleep": return sleepSheet();
    case "sync": return syncGoogle();
    case "checkin":
      return store.update((st) => {
        const c = (st.checkins[dateKey()] ||= {});
        const v = Number(b.dataset.val);
        c[b.dataset.key] = c[b.dataset.key] === v ? undefined : v;
      });
    case "override":
      return store.update((st) => {
        const t = dateKey();
        const auto = readiness({ night: st.nights[t], recentNights: recentNights(st), checkin: st.checkins[t], profile: st.profile, recentSessions: st.sessions }).level;
        if (b.dataset.level === auto) delete st.override[t]; else st.override[t] = b.dataset.level;
      });
    case "start": return startWorkout();
    case "leave-workout": return go("today");
    case "cancel-workout":
      if (confirm("Abandonner cette séance ? Rien ne sera enregistré.")) { store.update((st) => { st.active = null; }); stopRest(); go("today"); }
      return;
    case "finish": return finishWorkout();
    case "toggle-set": {
      const ei = +b.dataset.ei, si = +b.dataset.si;
      let nowDone = false;
      store.update((st) => {
        const x = st.active.exercises[ei].sets[si];
        x.done = !x.done;
        nowDone = x.done;
        // Propage la charge aux séries suivantes non faites
        if (x.done && x.weight != null) st.active.exercises[ei].sets.slice(si + 1).forEach((y) => { if (!y.done && (y.weight == null || y.weight === "")) y.weight = x.weight; });
      });
      if (nowDone) {
        navigator.vibrate?.(30);
        const e = store.get().active.exercises[ei];
        const exDone = e.sets.every((x) => x.done);
        startRest(e.rest);
        if (exDone) document.getElementById(`ex-${ei + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    case "toggle-item": return store.update((st) => { const it = st.active.items[+b.dataset.i]; it.done = !it.done; });
    case "toggle-finisher": return store.update((st) => { st.active.finisherDone = !st.active.finisherDone; });
    case "add-set":
      return store.update((st) => {
        const e = st.active.exercises[+b.dataset.ei];
        const l = e.sets[e.sets.length - 1];
        e.sets.push({ weight: l?.weight ?? null, reps: e.repsTarget[1], done: false });
      });
    case "swap": return swapSheet(+b.dataset.ei);
    case "rest-add": restEnd += 30_000; return tickRest();
    case "rest-skip": return stopRest();
    case "add-weight": return weightSheet();
    case "set-profile": {
      const v = b.dataset.val;
      return store.update((st) => { st.profile[b.dataset.field] = isNaN(Number(v)) ? v : Number(v); });
    }
    case "disconnect":
      gh.disconnect();
      store.update((st) => { st.google.connected = false; });
      return toast("Google Health déconnecté");
    case "demo-sleep": return demoSleep();
    case "export": {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `forme-sauvegarde-${dateKey()}.json`;
      a.click();
      return setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    case "reset":
      if (confirm("Effacer toutes tes données (profil, séances, nuits) ?")) { store.reset(); onb.step = 0; go("today"); }
      return;
  }
});

$app.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.onb) {
    onb.data[t.dataset.onb] = t.type === "number" ? Number(t.value) : t.value;
  }
});

$app.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.field && t.dataset.ei != null) {
    // Saisie pendant la séance : pas de re-rendu pour garder le focus
    const ei = +t.dataset.ei, si = +t.dataset.si;
    const v = t.value === "" ? null : Number(t.value.replace(",", "."));
    store.update((st) => { st.active.exercises[ei].sets[si][t.dataset.field] = v; }, true);
    return;
  }
  if (t.dataset.profile) {
    const v = t.type === "number" ? Number(t.value) : t.value.trim();
    store.update((st) => { st.profile[t.dataset.profile] = v; });
  }
  if (t.id === "g-client") {
    store.update((st) => { st.google.clientId = t.value.trim(); });
    toast("Client ID enregistré");
  }
  if (t.id === "import-file" && t.files[0]) {
    t.files[0].text().then((txt) => {
      try { store.importJSON(txt); toast("Données importées"); } catch { toast("Fichier invalide"); }
    });
  }
});

$sheetRoot.addEventListener("click", (ev) => { if (ev.target.dataset.action === "close-sheet") closeSheet(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeSheet(); });

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
