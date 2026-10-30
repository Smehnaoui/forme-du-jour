// Vérifie les schémas d'exercices : node tools/check-figures.mjs
// Échoue si un schéma est figé, saute d'une image à l'autre, sort du cadre, passe sous le sol,
// laisse glisser un appui (pied ou main immobile au départ et à l'arrivée) ou n'a pas de tempo.
import { FIGURE_IDS, sampleFigure } from "../js/figures.js";

const FLOOR = 92.6, HEAD_R = 5.3;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
let failed = 0;

for (const id of FIGURE_IDS) {
  // Échantillonnage fin : un mouvement rapide mais continu ne dépasse jamais 2,5 d'une image à l'autre
  const { spec, total, frames, a, b } = sampleFigure(id, 1600);
  const issues = [];
  if (!spec.gen && (!Array.isArray(spec.tempo) || spec.tempo.length !== 4 || !spec.say)) issues.push("tempo ou consignes manquants");

  frames.forEach((f, i) => {
    for (const [k, p] of Object.entries(f)) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) issues.push(`${k} : coordonnée invalide`);
      const top = k === "hd" ? p[1] - HEAD_R : p[1];
      if (p[0] < -1 || p[0] > 101 || top < -6.5) issues.push(`${k} hors cadre (${p.map((v) => v.toFixed(1))}) à ${(i / (frames.length - 1) * total).toFixed(2)} s`);
      const sole = /^(heel|toe)/.test(k) ? 1.9 : 0;
      if (!spec.noFloor && p[1] + sole > FLOOR + 0.7) issues.push(`${k} sous le sol (${p[1].toFixed(1)})`);
    }
    if (i) {
      const prev = frames[i - 1];
      const jump = Math.max(...Object.keys(f).map((k) => dist(f[k], prev[k])));
      if (jump > 2.5) issues.push(`saut de ${jump.toFixed(1)} à ${(i / (frames.length - 1) * total).toFixed(2)} s`);
    }
  });

  if (a && b) {
    const moved = Math.max(...Object.keys(a).map((k) => dist(a[k], b[k])));
    if (moved < 2 && !spec.hold) issues.push(`figé (mouvement max ${moved.toFixed(1)})`);
    // Un point identique au départ et à l'arrivée doit rester en place pendant tout le mouvement
    for (const k of Object.keys(a)) {
      if (dist(a[k], b[k]) > 0.3) continue;
      const drift = Math.max(...frames.map((f) => dist(f[k], a[k])));
      if (drift > 0.8) issues.push(`${k} glisse de ${drift.toFixed(1)} alors qu'il est fixe au départ et à l'arrivée`);
    }
  }

  const uniq = [...new Set(issues)];
  if (uniq.length) {
    failed++;
    console.log(`✗ ${id}\n  ${uniq.slice(0, 6).join("\n  ")}${uniq.length > 6 ? `\n  … ${uniq.length - 6} de plus` : ""}`);
  }
}

console.log(failed ? `\n${failed} schéma(s) à corriger sur ${FIGURE_IDS.length}.` : `${FIGURE_IDS.length} schémas vérifiés : aucun problème.`);
process.exit(failed ? 1 : 0);
