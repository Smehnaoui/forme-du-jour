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

## Comment la séance s'adapte

| Score de forme | Séance |
|---|---|
| 75+ | **Intense** : 4 × 6–8, RPE 8, finisher en intervalles si le temps le permet |
| 52–74 | **Standard** : 3 × 8–10, RPE 7, cardio zone 2 en fin de séance |
| 32–51 | **Léger** : charges réduites, 2 séries, variantes guidées, pas d'échec |
| < 32 | **Récupération** : mobilité + marche, pas de muscu |

Score = sommeil 35 · VFC 25 · ressenti 20 · FC repos 10 · charge d'entraînement 10. Une donnée absente sort du calcul et
les autres sont repondérées (sans montre : sommeil + ressenti). Garde-fous : signes de maladie, dette de sommeil,
surcharge de la semaine, sport d'endurance la veille, 3 jours d'entraînement d'affilée.

La séance tient dans la durée choisie, les jours d'entraînement sont choisis dans le profil (48 h entre deux full body,
séance manquée rattrapée), et les charges viennent du 1RM estimé sur les dernières séances.

## Fichiers

- `js/engine.js` : score de forme, génération des séances, progression, nutrition
- `js/exercises.js` : bibliothèque d'exercices (salle / haltères / poids du corps)
- `js/google-health.js` : OAuth + lecture des données Google Health (chacune facultative)
- `js/app.js` : interface · `js/store.js` : données (stockées localement sur l'appareil)
