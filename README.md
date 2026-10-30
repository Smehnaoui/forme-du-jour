# Forme du jour

Coach de musculation personnel qui adapte chaque séance à ton sommeil (Google Health) et à ton ressenti.
Objectif : **recomposition** (perdre du gras, prendre du muscle).

**En ligne :** https://smehnaoui.github.io/forme-du-jour/ (GitHub Pages, mis à jour à chaque `git push`)

## Lancer l'app en local

```bash
node server.js
```

Puis ouvre http://localhost:5173. Sur téléphone (même Wi-Fi) : `HOST=0.0.0.0 node server.js`, puis
« Ajouter à l'écran d'accueil » pour l'installer comme une app.

> Google n'autorise l'OAuth que sur `localhost` ou en HTTPS. Pour l'utiliser depuis ton téléphone avec Google Health,
> héberge le dossier en HTTPS (GitHub Pages, Netlify, Cloudflare Pages…) et ajoute cette adresse aux origines autorisées.

## Connecter Google Health

1. [console.cloud.google.com](https://console.cloud.google.com) → nouveau projet → active la **Google Health API**.
2. Écran de consentement OAuth : « Externe », ajoute ton Gmail comme **utilisateur test**, et les accès (lecture seule) :
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
3. Identifiants → ID client OAuth → **Application Web** → origine JavaScript : `http://localhost:5173`
   (+ ton adresse HTTPS si tu l'héberges).
4. Dans l'app : Profil → Google Health → colle le Client ID → **Connecter**.

L'app lit en lecture seule : sommeil (durée, efficacité, phases), variabilité cardiaque, FC au repos, respiration /
température / SpO₂ nocturnes, pas, dépense énergétique, séances de sport, poids et masse grasse.
**Chaque donnée est facultative** : elle est lue séparément, et si elle manque (pas de montre, accès décoché, erreur Google),
l'app continue avec les autres et ses valeurs par défaut. Profil → Google Health indique ce qui a été reçu.
Sans Google, tu peux saisir ta nuit en 5 secondes chaque matin.

Le compte Google est mémorisé à la première connexion : ensuite, quand le jeton (valable 1 h) expire, un appui sur
Synchroniser le renouvelle sur ce compte sans redemander de le choisir.

## Comment la séance s'adapte

**Énergie du jour = récupération du matin − fatigue de la journée.**

- Récupération : sommeil 35 · VFC 25 · ressenti 20 · FC repos 10 · charge d'entraînement 10. Une donnée absente sort du
  calcul et les autres sont repondérées (sans montre : sommeil + ressenti). Garde-fous : signes de maladie, dette de
  sommeil, surcharge de la semaine, sport d'endurance la veille, 3 jours d'entraînement d'affilée.
- Fatigue de la journée (jusqu'à −30) : pas au-delà de ton rythme habituel à cette heure, sport enregistré par Google,
  journée « active » ou « physique » déclarée, plus de 12 h debout (amplifié après une nuit courte).

| Énergie | Séance |
|---|---|
| 85+ | **Au top** : top set lourd sur le 1er exercice puis séries à −10 %, intervalles |
| 68–84 | **Pleine forme** : 4 × 6–8, RPE 8, intervalles si le temps le permet |
| 50–67 | **En forme** : 3 × 8–10, RPE 7, cardio zone 2 |
| 32–49 | **Fatigué** : 2 séries, variantes guidées, pas d'échec, marche |
| < 32 | **À recharger** : récupération choisie selon l'état (décompression si courbatures, recharge si vidé, repos actif si en forme un jour de repos) |

Programme : full body (2–3 jours), haut / bas (4 jours) ou haut / bas + poussée / tirage / jambes (5 jours), en cycles de
4 semaines (technique → volume → intensité → décharge). Échauffement et séries d'approche calculés, accessoires en
superset quand le temps manque, séance tenue dans la durée choisie, charges tirées du 1RM estimé.

## Fichiers

- `js/engine.js` : énergie du jour, génération des séances, progression, nutrition
- `js/exercises.js` : bibliothèque d'exercices (muscles, consignes) et routines de récupération
- `js/figures.js` : schémas SVG animés des exercices (personnage articulé, tempo et consignes par exercice,
  lecteur avec pause et ralenti dans la fiche) et carte des muscles
- `tools/check-figures.mjs` : à lancer après toute retouche d'un schéma (`node tools/check-figures.mjs`) ; échoue si
  un schéma est figé, saute, sort du cadre, passe sous le sol ou laisse glisser un appui
- `js/google-health.js` : OAuth + lecture des données Google Health (chacune facultative)
- `js/app.js` : interface · `js/store.js` : données (stockées localement sur l'appareil)
