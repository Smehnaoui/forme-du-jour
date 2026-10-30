// Bibliothèque d'exercices, classés par schéma moteur.
// equip : "gym" (salle complète), "db" (haltères/banc à la maison), "bw" (poids du corps)
// easy : variante plus douce, privilégiée les jours de fatigue (machine, guidée, moins technique)
// bw : se fait au poids du corps (pas de charge proposée, progression par répétitions / variante)
// uni : unilatéral (répétitions par côté) · timed : en secondes
// m : muscles { p: principaux, s: secondaires } · cues : 3 consignes courtes · fig : schéma (figures.js)

export const MUSCLES = {
  chest: "Pectoraux", delts: "Épaules", rear: "Arrière d'épaule", traps: "Trapèzes", upperback: "Haut du dos",
  lats: "Dorsaux", biceps: "Biceps", triceps: "Triceps", forearms: "Avant-bras", abs: "Abdos", obliques: "Obliques",
  lowerback: "Lombaires", glutes: "Fessiers", quads: "Quadriceps", hamstrings: "Ischios", adductors: "Adducteurs", calves: "Mollets",
};

/** Groupes affichés dans la bibliothèque. */
export const GROUPS = {
  legs: { label: "Jambes", patterns: ["squat", "hinge", "lunge", "hamstring", "quad", "glute", "calves"] },
  push: { label: "Poussée", patterns: ["hpush", "vpush", "lateral", "fly"] },
  pull: { label: "Tirage", patterns: ["hpull", "vpull", "rear"] },
  arms: { label: "Bras", patterns: ["biceps", "triceps"] },
  core: { label: "Gainage", patterns: ["core", "carry"] },
};

const X = (name, pattern, equip, m, cues, o = {}) => ({ name, pattern, equip, m, cues, compound: false, ...o });
const C = { compound: true };

export const EXERCISES = {
  // ── Jambes : squat
  back_squat:    X("Squat barre", "squat", ["gym"], { p: ["quads", "glutes"], s: ["adductors", "lowerback"] },
    ["Barre sur les trapèzes", "Genoux dans l'axe des pieds", "Hanches sous les genoux"], C),
  front_squat:   X("Squat avant", "squat", ["gym"], { p: ["quads"], s: ["glutes", "abs"] },
    ["Barre sur l'avant des épaules", "Coudes hauts", "Buste droit"], C),
  goblet_squat:  X("Goblet squat", "squat", ["gym", "db"], { p: ["quads", "glutes"], s: ["abs"] },
    ["Haltère contre la poitrine", "Coudes entre les genoux", "Talons au sol"], { ...C, easy: true }),
  leg_press:     X("Presse à cuisses", "squat", ["gym"], { p: ["quads", "glutes"], s: ["adductors"] },
    ["Bas du dos collé au dossier", "Genoux vers la poitrine", "Ne verrouille pas en haut"], { ...C, easy: true }),
  bw_squat:      X("Squat tempo", "squat", ["bw"], { p: ["quads", "glutes"], s: [] },
    ["Descente en 3 s", "Bras devant pour l'équilibre", "Remontée explosive"], { ...C, easy: true, bw: true }),
  jump_squat:    X("Squat sauté", "squat", ["bw"], { p: ["quads", "glutes"], s: ["calves"] },
    ["Quart de squat", "Saute bras tendus", "Réception souple"], { ...C, bw: true }),

  // ── Jambes : hinge (chaîne postérieure)
  rdl:           X("Soulevé de terre roumain", "hinge", ["gym"], { p: ["hamstrings", "glutes"], s: ["lowerback", "forearms"] },
    ["Hanches vers l'arrière", "Dos neutre", "Barre au contact des cuisses"], C),
  deadlift:      X("Soulevé de terre", "hinge", ["gym"], { p: ["glutes", "hamstrings", "lowerback"], s: ["quads", "traps", "forearms"] },
    ["Barre au-dessus du milieu du pied", "Pousse le sol avec les jambes", "Dos gainé tout du long"], C),
  db_rdl:        X("Soulevé roumain haltères", "hinge", ["gym", "db"], { p: ["hamstrings", "glutes"], s: ["lowerback"] },
    ["Genoux légèrement fléchis", "Haltères le long des jambes", "Sens l'étirement des ischios"], { ...C, easy: true }),
  hip_thrust:    X("Hip thrust", "hinge", ["gym", "db"], { p: ["glutes"], s: ["hamstrings"] },
    ["Haut du dos sur le banc", "Menton rentré", "Serre les fessiers 1 s en haut"], { ...C, easy: true }),
  glute_bridge:  X("Pont fessier", "hinge", ["bw"], { p: ["glutes"], s: ["hamstrings"] },
    ["Pousse dans les talons", "Bassin aligné en haut", "Pause 2 s"], { ...C, easy: true, bw: true }),

  // ── Jambes : fente / unilatéral
  bulgarian:     X("Squat bulgare", "lunge", ["gym", "db", "bw"], { p: ["quads", "glutes"], s: ["adductors"] },
    ["Pied arrière sur le banc", "Buste légèrement penché", "Genou avant stable"], { ...C, uni: true }),
  walking_lunge: X("Fentes marchées", "lunge", ["gym", "db", "bw"], { p: ["quads", "glutes"], s: ["adductors"] },
    ["Grand pas", "Genou arrière frôle le sol", "Buste droit"], { ...C, easy: true, uni: true }),
  reverse_lunge: X("Fente arrière", "lunge", ["gym", "db", "bw"], { p: ["glutes", "quads"], s: ["hamstrings"] },
    ["Recule d'un grand pas", "Poids sur le talon avant", "Remonte en poussant devant"], { ...C, easy: true, uni: true }),
  step_up:       X("Montée sur banc", "lunge", ["gym", "db", "bw"], { p: ["quads", "glutes"], s: ["calves"] },
    ["Pied entier sur le banc", "Monte sans pousser derrière", "Descente contrôlée"], { ...C, easy: true, uni: true }),

  // ── Isolation jambes
  leg_curl:      X("Leg curl allongé", "hamstring", ["gym"], { p: ["hamstrings"], s: ["calves"] },
    ["Hanches collées au banc", "Ramène les talons aux fessiers", "Retour lent"], { easy: true }),
  single_leg_rdl: X("Soulevé roumain unilatéral", "hamstring", ["db", "bw"], { p: ["hamstrings", "glutes"], s: ["lowerback"] },
    ["Hanches de face", "Jambe arrière dans l'axe du buste", "Genou d'appui souple"], { easy: true, uni: true }),
  slider_curl:   X("Leg curl glissé", "hamstring", ["bw"], { p: ["hamstrings"], s: ["glutes"] },
    ["Talons sur une serviette", "Bassin levé tout du long", "Ramène lentement"], { easy: true, bw: true }),
  leg_extension: X("Leg extension", "quad", ["gym"], { p: ["quads"], s: [] },
    ["Dos calé au dossier", "Tends complètement", "Pause 1 s en haut"], { easy: true }),
  wall_sit:      X("Chaise contre le mur", "quad", ["db", "bw"], { p: ["quads"], s: ["glutes"] },
    ["Dos plaqué au mur", "Cuisses parallèles au sol", "Respire calmement"], { easy: true, bw: true, timed: true }),
  cable_kickback: X("Kickback fessier poulie", "glute", ["gym"], { p: ["glutes"], s: ["hamstrings"] },
    ["Buste penché, gainé", "Pousse le talon vers l'arrière", "Pas de cambrure"], { easy: true, uni: true }),
  frog_pump:     X("Pont fessier pieds joints", "glute", ["db", "bw"], { p: ["glutes"], s: [] },
    ["Plantes de pieds collées", "Genoux ouverts", "Contraction rapide en haut"], { easy: true, bw: true }),
  standing_calf: X("Mollets debout machine", "calves", ["gym"], { p: ["calves"], s: [] },
    ["Amplitude complète", "1 s étiré en bas", "Monte sur la pointe"], { easy: true }),
  db_calf:       X("Mollets debout haltère", "calves", ["db"], { p: ["calves"], s: [] },
    ["Avant du pied sur une marche", "Monte sur la pointe", "Descente lente"], { easy: true, uni: true }),
  calf_raise_bw: X("Mollets sur marche", "calves", ["bw"], { p: ["calves"], s: [] },
    ["Une jambe à la fois", "Talon sous la marche", "Pause en haut"], { easy: true, bw: true, uni: true }),

  // ── Poussée horizontale
  bench_press:   X("Développé couché barre", "hpush", ["gym"], { p: ["chest"], s: ["triceps", "delts"] },
    ["Omoplates serrées", "Pieds ancrés au sol", "Barre au bas des pecs"], C),
  db_bench:      X("Développé couché haltères", "hpush", ["gym", "db"], { p: ["chest"], s: ["triceps", "delts"] },
    ["Coudes à 45°", "Descends bas", "Pousse en arc vers le haut"], { ...C, easy: true }),
  incline_db:    X("Développé incliné haltères", "hpush", ["gym", "db"], { p: ["chest", "delts"], s: ["triceps"] },
    ["Banc à 30°", "Descends au haut des pecs", "Poignets au-dessus des coudes"], C),
  chest_press:   X("Chest press machine", "hpush", ["gym"], { p: ["chest"], s: ["triceps", "delts"] },
    ["Poignées à hauteur de poitrine", "Omoplates contre le dossier", "Expire en poussant"], { ...C, easy: true }),
  dips:          X("Dips", "hpush", ["gym", "bw"], { p: ["chest", "triceps"], s: ["delts"] },
    ["Buste légèrement penché", "Descends à 90° aux coudes", "Épaules basses"], { ...C, bw: true }),
  pushup:        X("Pompes", "hpush", ["bw", "db"], { p: ["chest"], s: ["triceps", "delts", "abs"] },
    ["Corps gainé en planche", "Mains sous les épaules", "Poitrine proche du sol"], { ...C, easy: true, bw: true }),
  incline_pushup: X("Pompes mains surélevées", "hpush", ["bw", "db"], { p: ["chest"], s: ["triceps", "delts"] },
    ["Mains sur un banc ou une table", "Corps droit", "Poitrine vers le bord"], { ...C, easy: true, bw: true }),
  cable_fly:     X("Écarté poulie", "fly", ["gym"], { p: ["chest"], s: ["delts"] },
    ["Coudes légèrement fléchis", "Ramène les mains devant toi", "Ouvre lentement"], { easy: true }),
  db_fly:        X("Écarté couché haltères", "fly", ["db"], { p: ["chest"], s: ["delts"] },
    ["Bras presque tendus", "Ouvre jusqu'à l'étirement", "Referme en arc"], { easy: true }),

  // ── Tirage horizontal
  barbell_row:   X("Rowing barre", "hpull", ["gym"], { p: ["lats", "upperback"], s: ["biceps", "rear", "lowerback"] },
    ["Buste penché à 45°", "Tire vers le nombril", "Serre les omoplates"], C),
  db_row:        X("Rowing haltère", "hpull", ["gym", "db"], { p: ["lats", "upperback"], s: ["biceps", "rear"] },
    ["Main et genou sur le banc", "Coude vers la hanche", "Dos plat"], { ...C, easy: true, uni: true }),
  cable_row:     X("Tirage horizontal poulie", "hpull", ["gym"], { p: ["upperback", "lats"], s: ["biceps", "rear"] },
    ["Poitrine haute", "Coudes le long du corps", "Pause poignée au ventre"], { ...C, easy: true }),
  inverted_row:  X("Rowing inversé", "hpull", ["bw"], { p: ["upperback", "lats"], s: ["biceps", "rear"] },
    ["Sous une table ou une barre", "Corps droit", "Poitrine vers la barre"], { ...C, easy: true, bw: true }),

  // ── Tirage vertical
  pullup:        X("Tractions", "vpull", ["gym", "bw"], { p: ["lats"], s: ["biceps", "upperback"] },
    ["Départ bras tendus", "Poitrine vers la barre", "Menton au-dessus"], { ...C, bw: true }),
  lat_pulldown:  X("Tirage vertical poulie", "vpull", ["gym"], { p: ["lats"], s: ["biceps", "upperback"] },
    ["Barre vers le haut de la poitrine", "Coudes vers le bas", "Buste fixe"], { ...C, easy: true }),
  negative_pullup: X("Tractions négatives", "vpull", ["bw"], { p: ["lats"], s: ["biceps"] },
    ["Saute en position haute", "Descends en 4 s", "Bras tendus en bas"], { ...C, easy: true, bw: true }),
  db_pullover:   X("Pull-over haltère", "vpull", ["db"], { p: ["lats"], s: ["chest", "triceps"] },
    ["Allongé sur le banc", "Bras presque tendus", "Étire les dorsaux"], { easy: true }),

  // ── Épaules
  ohp:           X("Développé militaire", "vpush", ["gym"], { p: ["delts"], s: ["triceps", "abs"] },
    ["Fessiers serrés", "Barre au-dessus de la tête", "Tête passe devant la barre"], C),
  db_shoulder:   X("Développé épaules haltères", "vpush", ["gym", "db"], { p: ["delts"], s: ["triceps"] },
    ["Assis, dos calé", "Haltères à hauteur d'oreilles", "Ne cambre pas"], { ...C, easy: true }),
  pike_pushup:   X("Pompes piquées", "vpush", ["bw"], { p: ["delts"], s: ["triceps"] },
    ["Hanches hautes", "Tête entre les mains", "Coudes vers l'arrière"], { ...C, bw: true }),
  lateral_raise: X("Élévations latérales", "lateral", ["gym", "db"], { p: ["delts"], s: ["traps"] },
    ["Coudes légèrement fléchis", "Monte à l'horizontale", "Descente lente"], { easy: true }),
  bw_lateral:    X("Élévations latérales lestées", "lateral", ["bw"], { p: ["delts"], s: [] },
    ["Bouteilles d'eau ou sacs", "Monte à l'horizontale", "Tempo lent"], { easy: true, bw: true }),
  face_pull:     X("Face pull", "rear", ["gym"], { p: ["rear"], s: ["traps", "upperback"] },
    ["Corde vers le front", "Coudes hauts", "Pouces vers l'arrière"], { easy: true }),
  reverse_fly:   X("Oiseau haltères", "rear", ["gym", "db"], { p: ["rear"], s: ["upperback"] },
    ["Buste penché", "Ouvre les bras", "Sans hausser les épaules"], { easy: true }),
  y_raise:       X("Y-raise allongé", "rear", ["bw"], { p: ["rear", "traps"], s: ["lowerback"] },
    ["À plat ventre", "Bras en Y", "Pouces vers le ciel"], { easy: true, bw: true }),

  // ── Bras
  db_curl:       X("Curl haltères", "biceps", ["gym", "db"], { p: ["biceps"], s: ["forearms"] },
    ["Coudes fixes", "Paumes vers le haut", "Descente contrôlée"], { easy: true }),
  hammer_curl:   X("Curl marteau", "biceps", ["gym", "db"], { p: ["biceps", "forearms"], s: [] },
    ["Prise neutre", "Coudes collés", "Pas d'élan"], { easy: true }),
  barbell_curl:  X("Curl barre", "biceps", ["gym"], { p: ["biceps"], s: ["forearms"] },
    ["Prise largeur d'épaules", "Coudes fixes", "Serre en haut"], {}),
  chinup:        X("Tractions supination", "biceps", ["bw"], { p: ["biceps", "lats"], s: ["upperback"] },
    ["Paumes vers toi", "Menton au-dessus", "Descente lente"], { ...C, bw: true }),
  triceps_pushdown: X("Extension triceps poulie", "triceps", ["gym"], { p: ["triceps"], s: [] },
    ["Coudes collés au corps", "Tends en bas", "Remonte jusqu'à 90°"], { easy: true }),
  overhead_ext:  X("Extension triceps nuque", "triceps", ["gym", "db"], { p: ["triceps"], s: [] },
    ["Haltère derrière la tête", "Coudes vers le plafond", "Tends complètement"], { easy: true }),
  skull_crusher: X("Barre au front", "triceps", ["gym"], { p: ["triceps"], s: [] },
    ["Allongé, bras verticaux", "Fléchis vers le front", "Coudes immobiles"], {}),
  bench_dip:     X("Dips sur banc", "triceps", ["db", "bw"], { p: ["triceps"], s: ["chest", "delts"] },
    ["Mains sur le bord du banc", "Descends à 90°", "Dos près du banc"], { easy: true, bw: true }),
  diamond_pushup: X("Pompes diamant", "triceps", ["bw"], { p: ["triceps"], s: ["chest"] },
    ["Mains jointes sous la poitrine", "Coudes près du corps", "Corps gainé"], { bw: true }),

  // ── Gainage / porté
  plank:         X("Planche", "core", ["gym", "db", "bw"], { p: ["abs"], s: ["obliques", "delts"] },
    ["Sur les avant-bras", "Fessiers et abdos serrés", "Respire calmement"], { easy: true, timed: true, bw: true }),
  side_plank:    X("Planche latérale", "core", ["gym", "db", "bw"], { p: ["obliques"], s: ["abs", "glutes"] },
    ["Coude sous l'épaule", "Bassin haut", "Corps aligné"], { easy: true, timed: true, bw: true, uni: true }),
  dead_bug:      X("Dead bug", "core", ["gym", "db", "bw"], { p: ["abs"], s: ["obliques"] },
    ["Bas du dos plaqué au sol", "Bras et jambe opposés", "Très lent"], { easy: true, bw: true, uni: true }),
  hanging_knee:  X("Relevés de genoux suspendu", "core", ["gym", "bw"], { p: ["abs"], s: ["obliques", "forearms"] },
    ["Suspendu à la barre", "Genoux vers la poitrine", "Pas d'élan"], { bw: true }),
  crunch:        X("Crunch", "core", ["db", "bw"], { p: ["abs"], s: [] },
    ["Bas du dos au sol", "Enroule le buste", "Expire en montant"], { easy: true, bw: true }),
  mountain_climber: X("Mountain climbers", "core", ["gym", "db", "bw"], { p: ["abs"], s: ["quads", "delts"] },
    ["Position de pompe", "Genoux vers la poitrine", "Rythme soutenu"], { bw: true, timed: true }),
  bird_dog:      X("Bird dog", "core", ["gym", "db", "bw"], { p: ["lowerback", "abs"], s: ["glutes"] },
    ["À quatre pattes", "Bras et jambe opposés tendus", "Bassin immobile"], { easy: true, bw: true, uni: true }),
  farmer_carry:  X("Marche du fermier", "carry", ["gym", "db"], { p: ["forearms", "traps"], s: ["abs", "glutes"] },
    ["Charges lourdes, bras tendus", "Épaules basses", "Petits pas rapides"], { timed: true }),
};

// Ordre de préférence par schéma moteur (le premier compatible avec l'équipement gagne).
const PREFERENCE = {
  squat: ["back_squat", "goblet_squat", "front_squat", "leg_press", "bw_squat", "jump_squat"],
  hinge: ["rdl", "db_rdl", "hip_thrust", "deadlift", "glute_bridge"],
  lunge: ["bulgarian", "walking_lunge", "reverse_lunge", "step_up"],
  hamstring: ["leg_curl", "single_leg_rdl", "slider_curl"],
  quad: ["leg_extension", "wall_sit"],
  glute: ["cable_kickback", "hip_thrust", "frog_pump"],
  calves: ["standing_calf", "db_calf", "calf_raise_bw"],
  hpush: ["bench_press", "db_bench", "incline_db", "chest_press", "dips", "pushup", "incline_pushup"],
  fly: ["cable_fly", "db_fly"],
  hpull: ["barbell_row", "db_row", "cable_row", "inverted_row"],
  vpull: ["pullup", "lat_pulldown", "negative_pullup", "db_pullover"],
  vpush: ["ohp", "db_shoulder", "pike_pushup"],
  lateral: ["lateral_raise", "bw_lateral"],
  rear: ["face_pull", "reverse_fly", "y_raise"],
  biceps: ["db_curl", "hammer_curl", "barbell_curl", "chinup"],
  triceps: ["triceps_pushdown", "overhead_ext", "skull_crusher", "bench_dip", "diamond_pushup"],
  core: ["plank", "dead_bug", "hanging_knee", "side_plank", "bird_dog", "crunch", "mountain_climber"],
  carry: ["farmer_carry", "mountain_climber"],
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

// ───────────────────────── Récupération (jours sans musculation)

export const MOVES = {
  walk:        { name: "Marche active", m: { p: ["quads", "calves"], s: ["glutes"] }, cues: ["Allure où tu peux parler", "Idéalement dehors", "Respire par le nez"] },
  bike_easy:   { name: "Vélo tranquille", m: { p: ["quads"], s: ["calves", "glutes"] }, cues: ["Résistance faible", "Cadence régulière", "Zone 2"] },
  cat_cow:     { name: "Chat-vache", m: { p: ["lowerback", "abs"], s: [] }, cues: ["À quatre pattes", "Creuse puis arrondis le dos", "Suis ta respiration"] },
  child_pose:  { name: "Posture de l'enfant", m: { p: ["lats", "lowerback"], s: ["glutes"] }, cues: ["Fesses vers les talons", "Bras loin devant", "Relâche les épaules"] },
  t_rotation:  { name: "Fente + rotation", m: { p: ["obliques", "upperback"], s: ["glutes"] }, cues: ["Grande fente", "Main au sol", "Ouvre l'autre bras vers le ciel"] },
  hip_9090:    { name: "Hanches 90/90", m: { p: ["glutes", "adductors"], s: [] }, cues: ["Assis, genoux à 90°", "Bascule d'un côté à l'autre", "Buste droit"] },
  hip_flexor:  { name: "Étirement psoas", m: { p: ["quads"], s: ["abs"] }, cues: ["Un genou au sol", "Bascule le bassin en avant", "Serre le fessier arrière"] },
  figure4:     { name: "Étirement fessier", m: { p: ["glutes"], s: ["lowerback"] }, cues: ["Allongé, cheville sur le genou", "Ramène la cuisse", "Respire lentement"] },
  ham_stretch: { name: "Étirement ischios", m: { p: ["hamstrings"], s: ["calves"] }, cues: ["Allongé sur le dos", "Jambe tendue vers le ciel", "Tire doucement"] },
  dead_bug:    { name: "Dead bug lent", m: { p: ["abs"], s: [] }, cues: ["Bas du dos au sol", "Bras et jambe opposés", "Expire longuement"] },
  breathing:   { name: "Respiration 4-7-8", m: { p: [], s: [] }, cues: ["Inspire 4 s", "Bloque 7 s", "Expire 8 s"] },
};

/** Routines de récupération, choisies selon l'état du jour. */
export const RECOVERY = {
  active: {
    title: "Récupération active", focus: "Cardio doux · Mobilité",
    items: [["walk", "30 min"], ["cat_cow", "2 × 10"], ["t_rotation", "2 × 6 / côté"], ["hip_9090", "2 × 8"], ["hip_flexor", "2 × 45 s"], ["breathing", "5 cycles"]],
  },
  sore: {
    title: "Décompression", focus: "Mobilité · Étirements",
    items: [["walk", "15 min"], ["cat_cow", "2 × 10"], ["child_pose", "2 × 45 s"], ["figure4", "2 × 45 s / côté"], ["ham_stretch", "2 × 45 s / côté"], ["hip_flexor", "2 × 45 s"], ["breathing", "5 cycles"]],
  },
  low: {
    title: "Recharge", focus: "Marche · Respiration",
    items: [["walk", "20 min, lent"], ["child_pose", "1 min"], ["figure4", "45 s / côté"], ["dead_bug", "2 × 6 / côté"], ["breathing", "8 cycles"]],
  },
  fresh: {
    title: "Repos actif", focus: "Cardio zone 2 · Gainage",
    items: [["bike_easy", "30–40 min"], ["dead_bug", "3 × 8 / côté"], ["t_rotation", "2 × 6 / côté"], ["hip_flexor", "2 × 45 s"]],
  },
};
