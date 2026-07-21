# Hivest — Assistant d'automatisation des emails

Prototype : classification, détection d'urgence, réponse générée, alerte temps réel, relances automatiques.

## Démarrage

```bash
npm install
cp .env.example .env
# renseigner GROQ_API_KEY dans .env (gratuit, voir ci-dessous) — et Telegram si tu veux le bonus 1
npm start
```

### Obtenir une clé Groq gratuite

1. https://console.groq.com → créer un compte (aucune carte bancaire requise)
2. **API Keys** → **Create API Key**
3. Coller la clé dans `.env` : `GROQ_API_KEY=gsk_...`

Ouvrir http://localhost:3000

## Pour la démo live

1. **Traiter** un email → classification + brouillon de réponse (appel Claude).
2. Si urgence "haute" → alerte Telegram envoyée automatiquement (si configuré).
3. **Envoyer la réponse** → si l'email nécessite une relance (ex: demande de NDA), un délai démarre.
4. Ne rien faire (ou cliquer "Simuler réponse reçue" pour annuler) → après `FOLLOWUP_DELAY_MS`
   (30s par défaut pour la démo), une relance est générée et loggée automatiquement.

## Vérifier que tout marche sans consommer d'API (avant la démo)

```bash
npm test
```

Suite de 17 tests (Node test runner natif, aucune dépendance à installer) qui simule
les réponses de Groq et Telegram : classification, détection de fraude sur le RIB,
gestion des erreurs API, logique de relance (délai dépassé, réponse déjà reçue,
garde-fou anti-doublon...). Aucune clé API réelle n'est nécessaire pour les lancer.

Un workflow **GitHub Actions** (`.github/workflows/ci.yml`) relance cette suite
automatiquement à chaque push/PR sur `main`, sur Node 18/20/22 — sans secret à configurer.

## Envoi automatique selon l'urgence

- **Urgence faible ou moyenne** → la réponse générée est envoyée **automatiquement**, sans clic.
- **Urgence haute** (deadline, crise, cas sensible comme le RIB modifié) → reste **toujours**
  en attente de validation manuelle, quelle que soit la config. C'est volontaire : le brief
  précise que l'outil doit alerter plutôt qu'agir seul sur les cas sensibles.

## Simuler un flux entrant réel (sans IMAP/API mail)

Par défaut, tous les emails du dataset sont préchargés au démarrage. Pour simuler une vraie
boîte mail qui reçoit du courrier au fil de l'eau (utile pour la démo live) :

```bash
# Terminal 1 — démarre le serveur avec une boîte vide
EMPTY_INBOX=true npm start

# Terminal 2 — injecte les emails un par un, toutes les 4s par défaut
npm run simulate
```

Le script (`scripts/simulate-inbox.mjs`) lit `data/emails.json` et POST chaque email vers
`/api/inbox/receive`, exactement comme le demande le brief : une simple simulation du flux
entrant, sans connexion IMAP ni API mail réelle. Ajuste `INJECT_INTERVAL_MS` dans `.env`
pour changer le rythme.

## Configurer et tester l'alerte Telegram (bonus 1)

1. Parler à **@BotFather** sur Telegram → `/newbot` → récupérer le token.
2. Envoyer un message à ton bot, puis ouvrir dans le navigateur :
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → repérer `"chat":{"id":...}`.
3. Renseigner `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` dans `.env`.
4. Relancer le serveur, cliquer sur **🔔 Tester l'alerte Telegram** dans l'interface
   → un message doit arriver sur Telegram. C'est le moyen le plus rapide de vérifier
   la config sans attendre un email urgent.

## Scénario recommandé pour la démo live

1. **Traiter tous les emails en attente** (bouton en haut) → montre le tri en masse
   sur les 30 emails (catégories + urgences visibles d'un coup d'œil). Les urgences
   faible/moyenne partent automatiquement ; seules les urgences hautes restent en attente.
2. Zoomer sur **un email "deal" normal** (ex: Projet Alpha) → montrer le brouillon généré.
3. Zoomer sur **un email urgent** (ex: covenant bancaire, démission DG) → montrer le tag
   🚨, l'alerte reçue sur Telegram en direct, et le fait qu'il attend une validation manuelle.
4. Sur un email nécessitant une relance et non auto-envoyé → cliquer **Envoyer la réponse**,
   attendre 30s (délai réduit pour la démo), montrer la relance apparaître automatiquement
   dans le journal sans action manuelle.
5. Montrer un email **spam** → brouillon vide, urgence faible : le tri filtre bien le bruit.
6. (Optionnel) Relancer avec `EMPTY_INBOX=true` + `npm run simulate` pour montrer les
   emails arriver un par un en direct plutôt que préchargés.

## Structure

```
.github/workflows/ci.yml   CI GitHub Actions (check + tests, sans secret requis)
data/emails.json      30 emails fictifs (deal, LP, participation, conseil, admin, spam, cas limites)
test/pipeline.test.mjs 17 tests automatisés (classification, alertes, store, relances)
src/prompts.js        prompt système + construction du prompt par email
src/claudeClient.js   appel à l'API Groq, parsing JSON
src/store.js          état en mémoire + journal
src/alerts.js         alerte Telegram (bonus 1)
src/reminders.js       relances (bonus 2) — logique testable indépendamment du scheduler
src/server.js         serveur Express + routes API
public/index.html     interface de démo
```