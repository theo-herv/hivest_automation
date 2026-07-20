import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "emails.json");

const rawEmails = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

// État en mémoire : on enrichit chaque email avec son statut de traitement
export const emails = rawEmails.map((e) => ({
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
}));

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
