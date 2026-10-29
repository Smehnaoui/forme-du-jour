// Bibliothèque d'exercices, classés par schéma moteur.
// equip : "gym" (salle complète), "db" (haltères/banc à la maison), "bw" (poids du corps)
// easy : variante plus douce, privilégiée les jours de fatigue (machine, guidée, moins technique)
// bw : se fait au poids du corps (pas de charge proposée, progression par répétitions / variante)

export const EXERCISES = {
  // ── Jambes : squat
  back_squat:      { name: "Squat barre",              pattern: "squat", equip: ["gym"], compound: true, cue: "Pieds largeur d'épaules, genoux dans l'axe des pieds, descends hanches sous les genoux." },
  leg_press:       { name: "Presse à cuisses",         pattern: "squat", equip: ["gym"], compound: true, easy: true, cue: "Bas du dos collé au dossier, ne verrouille pas les genoux en haut." },
  goblet_squat:    { name: "Goblet squat",             pattern: "squat", equip: ["gym", "db"], compound: true, easy: true, cue: "Haltère contre la poitrine, coudes entre les genoux en bas." },
  bw_squat:        { name: "Squat tempo (3s descente)", pattern: "squat", equip: ["bw"], compound: true, easy: true, bw: true, cue: "Descends en 3 secondes, remonte explosif." },

  // ── Jambes : hinge (chaîne postérieure)
  rdl:             { name: "Soulevé de terre roumain",  pattern: "hinge", equip: ["gym"], compound: true, cue: "Dos neutre, pousse les hanches en arrière, barre au contact des cuisses." },
  db_rdl:          { name: "Soulevé roumain haltères",  pattern: "hinge", equip: ["gym", "db"], compound: true, easy: true, cue: "Genoux légèrement fléchis, sens l'étirement des ischios." },
  hip_thrust:      { name: "Hip thrust",                pattern: "hinge", equip: ["gym", "db"], compound: true, easy: true, cue: "Menton rentré, serre les fessiers 1s en haut." },
  glute_bridge:    { name: "Pont fessier unilatéral",   pattern: "hinge", equip: ["bw"], compound: true, easy: true, bw: true, cue: "Pousse dans le talon, bassin bien aligné." },

  // ── Jambes : fente / unilatéral
  bulgarian:       { name: "Squat bulgare",             pattern: "lunge", equip: ["gym", "db", "bw"], compound: true, cue: "Buste légèrement penché, genou avant stable." },
  walking_lunge:   { name: "Fentes marchées",           pattern: "lunge", equip: ["gym", "db", "bw"], compound: true, easy: true, cue: "Grand pas, genou arrière frôle le sol." },

  // ── Ischios (isolation)
  leg_curl:        { name: "Leg curl allongé",          pattern: "hamstring", equip: ["gym"], compound: false, easy: true, cue: "Contrôle la phase de retour, hanches collées au banc." },
  single_leg_rdl:  { name: "Soulevé roumain unilatéral", pattern: "hamstring", equip: ["db"], compound: false, easy: true, cue: "Hanches de face, la jambe arrière reste dans l'axe du buste." },
  slider_curl:     { name: "Leg curl glissé (serviette)", pattern: "hamstring", equip: ["bw"], compound: false, easy: true, bw: true, cue: "Bassin levé tout du long, ramène les talons lentement." },

  // ── Mollets
  standing_calf:   { name: "Mollets debout machine",    pattern: "calves", equip: ["gym"], compound: false, easy: true, cue: "Amplitude complète, 1 s d'arrêt étiré en bas." },
  db_calf:         { name: "Mollets debout haltère",    pattern: "calves", equip: ["db"], compound: false, easy: true, cue: "Avant du pied sur une marche, monte sur la pointe." },
  calf_raise_bw:   { name: "Mollets unilatéral sur marche", pattern: "calves", equip: ["bw"], compound: false, easy: true, bw: true, cue: "Une jambe à la fois, descente lente sous la marche." },

  // ── Poussée horizontale
  bench_press:     { name: "Développé couché barre",    pattern: "hpush", equip: ["gym"], compound: true, cue: "Omoplates serrées, pieds ancrés, barre au bas des pectoraux." },
  db_bench:        { name: "Développé couché haltères", pattern: "hpush", equip: ["gym", "db"], compound: true, easy: true, cue: "Coudes à ~45°, amplitude complète." },
  incline_db:      { name: "Développé incliné haltères", pattern: "hpush", equip: ["gym", "db"], compound: true, cue: "Banc à 30°, descends jusqu'au haut des pecs." },
  chest_press:     { name: "Chest press machine",       pattern: "hpush", equip: ["gym"], compound: true, easy: true, cue: "Poignées à hauteur de poitrine, expiration à la poussée." },
  pushup:          { name: "Pompes",                    pattern: "hpush", equip: ["bw", "db"], compound: true, easy: true, bw: true, cue: "Corps gainé en planche, poitrine proche du sol." },

  // ── Tirage horizontal
  barbell_row:     { name: "Rowing barre",              pattern: "hpull", equip: ["gym"], compound: true, cue: "Buste à ~45°, tire vers le nombril." },
  cable_row:       { name: "Tirage horizontal poulie",  pattern: "hpull", equip: ["gym"], compound: true, easy: true, cue: "Poitrine haute, ramène les coudes le long du corps." },
  db_row:          { name: "Rowing haltère unilatéral", pattern: "hpull", equip: ["gym", "db"], compound: true, easy: true, cue: "Main et genou sur le banc, tire le coude vers la hanche." },
  inverted_row:    { name: "Rowing inversé (table/barre)", pattern: "hpull", equip: ["bw"], compound: true, easy: true, bw: true, cue: "Corps droit, poitrine vers la barre." },

  // ── Arrière d'épaule
  face_pull:       { name: "Face pull poulie",          pattern: "rear", equip: ["gym"], compound: false, easy: true, cue: "Tire la corde vers le front, coudes hauts, pouces vers l'arrière." },
  reverse_fly:     { name: "Oiseau haltères",           pattern: "rear", equip: ["gym", "db"], compound: false, easy: true, cue: "Buste penché, ouvre les bras sans hausser les épaules." },
  y_raise:         { name: "Y-raise allongé",           pattern: "rear", equip: ["bw"], compound: false, easy: true, bw: true, cue: "À plat ventre, lève les bras en Y, pouces vers le ciel." },

  // ── Poussée verticale
  ohp:             { name: "Développé militaire",       pattern: "vpush", equip: ["gym"], compound: true, cue: "Fessiers serrés, la tête passe devant la barre en haut." },
  db_shoulder:     { name: "Développé épaules haltères assis", pattern: "vpush", equip: ["gym", "db"], compound: true, easy: true, cue: "Dos calé, ne cambre pas." },
  lateral_raise:   { name: "Élévations latérales",      pattern: "vpush", equip: ["gym", "db"], compound: false, easy: true, cue: "Coudes légèrement fléchis, monte jusqu'à l'horizontale." },
  pike_pushup:     { name: "Pompes piquées",            pattern: "vpush", equip: ["bw"], compound: true, bw: true, cue: "Hanches hautes, la tête descend entre les mains." },

  // ── Tirage vertical
  pullup:          { name: "Tractions",                 pattern: "vpull", equip: ["gym", "bw"], compound: true, bw: true, cue: "Départ bras tendus, menton au-dessus de la barre." },
  lat_pulldown:    { name: "Tirage vertical poulie",    pattern: "vpull", equip: ["gym"], compound: true, easy: true, cue: "Tire la barre vers le haut de la poitrine, coudes vers le bas." },
  db_pullover:     { name: "Pull-over haltère",         pattern: "vpull", equip: ["db"], compound: false, easy: true, cue: "Bras quasi tendus, sens l'étirement des dorsaux." },

  // ── Bras
  db_curl:         { name: "Curl haltères",             pattern: "arms", equip: ["gym", "db"], compound: false, easy: true, cue: "Coudes fixes, supination en haut." },
  triceps_pushdown:{ name: "Extension triceps poulie",  pattern: "arms", equip: ["gym"], compound: false, easy: true, cue: "Coudes collés au corps, verrouille en bas." },
  overhead_ext:    { name: "Extension triceps au-dessus de la tête", pattern: "arms", equip: ["db"], compound: false, easy: true, cue: "Coudes pointés vers le plafond." },
  diamond_pushup:  { name: "Pompes diamant",            pattern: "arms", equip: ["bw"], compound: false, bw: true, cue: "Mains rapprochées sous la poitrine." },

  // ── Gainage
  plank:           { name: "Planche",                   pattern: "core", equip: ["gym", "db", "bw"], compound: false, easy: true, timed: true, bw: true, cue: "Fessiers et abdos serrés, respire calmement." },
  dead_bug:        { name: "Dead bug",                  pattern: "core", equip: ["gym", "db", "bw"], compound: false, easy: true, bw: true, cue: "Bas du dos plaqué au sol en permanence." },
  hanging_knee:    { name: "Relevés de genoux suspendu", pattern: "core", equip: ["gym"], compound: false, bw: true, cue: "Pas d'élan, enroule le bassin." },
};

// Ordre de préférence par schéma moteur (le premier compatible avec l'équipement gagne).
const PREFERENCE = {
  squat: ["back_squat", "goblet_squat", "leg_press", "bw_squat"],
  hinge: ["rdl", "db_rdl", "hip_thrust", "glute_bridge"],
  lunge: ["bulgarian", "walking_lunge"],
  hamstring: ["leg_curl", "single_leg_rdl", "slider_curl"],
  calves: ["standing_calf", "db_calf", "calf_raise_bw"],
  hpush: ["bench_press", "db_bench", "incline_db", "chest_press", "pushup"],
  hpull: ["barbell_row", "db_row", "cable_row", "inverted_row"],
  rear:  ["face_pull", "reverse_fly", "y_raise"],
  vpush: ["ohp", "db_shoulder", "pike_pushup", "lateral_raise"],
  vpull: ["pullup", "lat_pulldown", "db_pullover"],
  arms:  ["db_curl", "triceps_pushdown", "overhead_ext", "diamond_pushup"],
  core:  ["plank", "dead_bug", "hanging_knee"],
};

/** Choisit un exercice pour un schéma. `variant` fait tourner les choix d'une séance à l'autre. */
export function pickExercise(pattern, equip, { easy = false, variant = 0, exclude = [] } = {}) {
  const pool = (PREFERENCE[pattern] || []).filter(
    (id) => EXERCISES[id].equip.includes(equip) && !exclude.includes(id)
  );
  if (!pool.length) return null;
  const easyPool = pool.filter((id) => EXERCISES[id].easy);
  const list = easy && easyPool.length ? easyPool : pool;
  return list[variant % list.length];
}

export function alternativesFor(id, equip) {
  const { pattern } = EXERCISES[id];
  return PREFERENCE[pattern].filter((x) => x !== id && EXERCISES[x].equip.includes(equip));
}

export const MOBILITY = [
  { name: "Marche active ou vélo tranquille", detail: "25–40 min, tu dois pouvoir parler (zone 2)" },
  { name: "Cat-cow", detail: "2 × 10 respirations lentes" },
  { name: "Fente avec rotation thoracique", detail: "2 × 6 par côté" },
  { name: "90/90 hanches", detail: "2 × 8 transitions" },
  { name: "Étirement fléchisseurs de hanche", detail: "2 × 45 s par côté" },
  { name: "Dead bug", detail: "2 × 8 par côté, très lent" },
  { name: "Respiration 4-7-8", detail: "5 cycles pour finir" },
];
