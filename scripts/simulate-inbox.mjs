// Simule une boîte mail qui reçoit du courrier en direct : lit le jeu de données
// fictif et envoie chaque email, un par un, à intervalle régulier, vers le serveur
// en cours d'exécution (via son API). Aucun accès IMAP/API mail réel n'est utilisé,
// conformément à la consigne : une simple simulation du flux entrant suffit.
//
// Utilisation :
//   1) Démarrer le serveur en mode "boîte vide" :  EMPTY_INBOX=true npm start
//   2) Dans un second terminal :                    node scripts/simulate-inbox.mjs
//
// Options (variables d'environnement) :
//   INJECT_INTERVAL_MS  délai entre deux emails "reçus" (défaut 4000 ms)
//   SERVER_URL           URL du serveur cible (défaut http://localhost:3000)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "emails.json");
const emails = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const INTERVAL_MS = Number(process.env.INJECT_INTERVAL_MS || 4000);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function inject(email) {
    const res = await fetch(`${SERVER_URL}/api/inbox/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email)
    });
    if (!res.ok) {
        throw new Error(`Échec injection "${email.subject}" — HTTP ${res.status}`);
    }
    return res.json();
}

async function main() {
    console.log(`Simulation du flux entrant — ${emails.length} emails, un toutes les ${INTERVAL_MS / 1000}s`);
    console.log(`Cible : ${SERVER_URL}\n`);

    for (const email of emails) {
        try {
            await inject(email);
            console.log(`📥 Reçu : "${email.subject}" (${email.fromName})`);
        } catch (err) {
            console.error(`❌ ${err.message}`);
            console.error("   Le serveur est-il bien lancé avec EMPTY_INBOX=true ?");
        }
        await sleep(INTERVAL_MS);
    }

    console.log("\n✅ Simulation terminée : tous les emails ont été injectés.");
}

main();
