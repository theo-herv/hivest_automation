import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { emails, logs, getEmail, addLog } from "./store.js";
import { classifyAndDraft } from "./claudeClient.js";
import { sendUrgentAlert } from "./alerts.js";
import { startReminderScheduler } from "./reminders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const FOLLOWUP_DELAY_MS = Number(process.env.FOLLOWUP_DELAY_MS || 86400000);

// Liste tous les emails avec leur statut actuel
app.get("/api/emails", (req, res) => {
  res.json(emails);
});

app.get("/api/logs", (req, res) => {
  res.json(logs);
});

// Logique de traitement d'un email, réutilisée par /process et /process-all
async function processEmail(email) {
  const result = await classifyAndDraft(email);
  Object.assign(email, result);
  email.status = "classified";
  addLog(`📩 Classé : "${email.subject}" → ${result.categorie} / urgence ${result.urgence}`);

  if (result.alerte_temps_reel) {
    await sendUrgentAlert(email, result.raison_urgence);
  }
  return email;
}

// Classe l'email + génère le brouillon de réponse, déclenche une alerte si besoin
app.post("/api/emails/:id/process", async (req, res) => {
  const email = getEmail(req.params.id);
  if (!email) return res.status(404).json({ error: "Email introuvable" });

  try {
    await processEmail(email);
    res.json(email);
  } catch (err) {
    addLog(`❌ Erreur de traitement — ${email.subject} : ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Traite en une fois tous les emails encore en attente (utile pour la démo)
app.post("/api/emails/process-all", async (req, res) => {
  const pending = emails.filter((e) => e.status === "pending");
  addLog(`⏳ Traitement par lot lancé — ${pending.length} email(s) en attente`);

  const results = [];
  for (const email of pending) {
    try {
      await processEmail(email);
      results.push({ id: email.id, ok: true });
    } catch (err) {
      addLog(`❌ Erreur de traitement — ${email.subject} : ${err.message}`);
      results.push({ id: email.id, ok: false, error: err.message });
    }
    // pause entre chaque appel pour rester sous les limites de débit de l'API gratuite
    // (le retry automatique sur 429 dans claudeClient.js gère le reste si besoin)
    await new Promise((r) => setTimeout(r, 2500));
  }

  addLog(`✅ Traitement par lot terminé — ${results.filter((r) => r.ok).length}/${pending.length} réussis`);
  res.json({ results, emails });
});

// Déclenche une alerte de test, indépendamment de la classification (pour valider la config Telegram)
app.post("/api/test-alert", async (req, res) => {
  const fakeEmail = {
    subject: "Email de test — vérification de l'alerte",
    fromName: "Système de test"
  };
  const result = await sendUrgentAlert(fakeEmail, "Ceci est un test manuel de la configuration d'alerte.");
  res.json(result);
});

// Envoie (simule l'envoi) de la réponse générée, programme une relance si nécessaire
app.post("/api/emails/:id/send-reply", (req, res) => {
  const email = getEmail(req.params.id);
  if (!email) return res.status(404).json({ error: "Email introuvable" });
  if (!email.brouillon_reponse) {
    return res.status(400).json({ error: "L'email doit d'abord être traité (/process)" });
  }

  email.status = "replied";
  email.repliedAt = new Date().toISOString();
  if (email.necessite_relance) {
    email.followUpDeadline = Date.now() + FOLLOWUP_DELAY_MS;
  }
  addLog(`✅ Réponse envoyée — "${email.subject}"`);
  res.json(email);
});

// Simule la réception d'une réponse du destinataire (annule la relance programmée)
app.post("/api/emails/:id/mark-answered", (req, res) => {
  const email = getEmail(req.params.id);
  if (!email) return res.status(404).json({ error: "Email introuvable" });

  email.answeredByRecipient = true;
  email.status = "answered";
  addLog(`💬 Réponse du destinataire reçue — "${email.subject}" (relance annulée)`);
  res.json(email);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hivest Email Automation — http://localhost:${PORT}`);
  startReminderScheduler();
});