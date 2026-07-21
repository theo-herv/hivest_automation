import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "emails.json");

const rawEmails = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

// Enrichit un email brut (du dataset ou injecté en direct) avec ses champs de traitement
function enrichEmail(e) {
  return {
    ...e,
    status: "pending", // pending -> classified -> replied -> answered
    categorie: null,
    urgence: null,
    raison_urgence: null,
    alerte_temps_reel: false,
    necessite_relance: false,
    action_suggeree: null,
    brouillon_reponse: null,
    repliedAt: null,
    followUpDeadline: null,
    followUpSent: false,
    answeredByRecipient: false
  };
}

// Mode démo "flux entrant simulé" : démarre avec une boîte vide, et les emails
// arrivent au fil de l'eau via /api/inbox/receive (voir scripts/simulate-inbox.mjs).
// Activé avec EMPTY_INBOX=true dans .env. Par défaut, tout le dataset est préchargé
// (comportement normal pour développer/tester sans lancer le script de simulation).
const startEmpty = process.env.EMPTY_INBOX === "true";

// État en mémoire : la boîte mail simulée
export const emails = startEmpty ? [] : rawEmails.map(enrichEmail);

export const logs = [];

export function addLog(message) {
  const entry = { time: new Date().toISOString(), message };
  logs.unshift(entry);
  console.log(`[LOG] ${message}`);
  return entry;
}

export function getEmail(id) {
  return emails.find((e) => e.id === id);
}

// Fait "arriver" un nouvel email dans la boîte (utilisé par la simulation de flux entrant)
export function receiveEmail(rawEmail) {
  const enriched = enrichEmail(rawEmail);
  emails.push(enriched);
  addLog(`📥 Nouvel email reçu — "${enriched.subject}"`);
  return enriched;
}