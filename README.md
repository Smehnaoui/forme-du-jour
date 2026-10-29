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
2. Écran de consentement OAuth : « Externe », ajoute ton Gmail comme **utilisateur test**, scope
   `https://www.googleapis.com/auth/googlehealth.sleep.readonly`.
3. Identifiants → ID client OAuth → **Application Web** → origine JavaScript : `http://localhost:5173`
   (+ ton adresse HTTPS si tu l'héberges).
4. Dans l'app : Profil → Google Health → colle le Client ID → **Connecter**.

L'app lit `users/me/dataTypes/sleep/dataPoints` (lecture seule) : durée, efficacité, phases profond / paradoxal.
Sans Google, tu peux saisir ta nuit en 5 secondes chaque matin.

## Comment la séance s'adapte

| Score de forme | Séance |
|---|---|
| 75+ | **Intense** : 4 × 6–8, RPE 8, finisher en intervalles |
| 52–74 | **Standard** : 3 × 8–10, RPE 7, 15 min cardio zone 2 |
| 32–51 | **Léger** : charges −20 %, 2 séries, variantes guidées, pas d'échec |
| < 32 | **Récupération** : mobilité + marche, pas de muscu |

Score = sommeil 65 % + énergie 20 % + courbatures 15 %, plafonné en cas de dette de sommeil (moyenne < 6 h sur 3 nuits)
ou de 3 jours d'entraînement d'affilée. Les charges progressent automatiquement (double progression).

## Fichiers

- `js/engine.js` : score de forme, génération des séances, progression, nutrition
- `js/exercises.js` : bibliothèque d'exercices (salle / haltères / poids du corps)
- `js/google-health.js` : OAuth + lecture du sommeil
- `js/app.js` : interface · `js/store.js` : données (stockées localement sur l'appareil)
