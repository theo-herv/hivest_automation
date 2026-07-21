import { emails, addLog } from "./store.js";
import { classifyAndDraft } from "./claudeClient.js";

const CHECK_INTERVAL_MS = 5000;

// Génère un message de relance contextualisé via Claude
async function generateFollowUp(email) {
  const followUpEmail = {
    ...email,
    subject: `Relance : ${email.subject}`,
    body: `Tu es un assistant chargé de rédiger des emails de suivi.

Le mail initial a déjà été envoyé. Aucune réponse n'a été reçue.

Ta mission est de rédiger le deuxième email, c'est-à-dire une relance.

Règles impératives :

Écris uniquement le corps du mail.
2 à 4 phrases maximum.
Le mail doit clairement être une relance adressée au destinataire.
Fais uniquement référence à la demande déjà envoyée.
Demande un retour ou une réponse dans les meilleurs délais.
Ne modifie jamais la demande initiale.
N'ajoute aucune nouvelle information.
N'écris jamais comme si tu répondais au destinataire.
N'invente jamais de contexte.
Ne remercie jamais le destinataire.
Ne t'excuse jamais.
Ne fais aucune hypothèse sur l'état d'avancement du dossier.
Ne dis pas que le projet est intéressant, disponible, en cours d'étude ou conforme à des critères.
Ne reformule pas la demande initiale en un nouveau premier contact.

La demande initiale est :

${email.action_suggeree}

Le résultat attendu ressemble à :

« Bonjour Julien,

Je me permets de faire suite à mon précédent message concernant ${email.action_suggeree}.

Pouvez-vous me faire un retour dès que possible ?

Cordialement, »

Ne produis aucun autre type d'email.`

  };
  const result = await classifyAndDraft(followUpEmail);
  return result.brouillon_reponse;
}

// Logique pure de vérification des relances, isolée du setInterval pour être testable unitairement.
// Retourne la liste des ids d'emails pour lesquels une relance a été déclenchée.
export async function checkReminders(now = Date.now(), pool = emails) {
  const triggered = [];
  for (const email of pool) {
    const isDue =
        email.status === "replied" &&
        email.necessite_relance &&
        !email.followUpSent &&
        !email.answeredByRecipient &&
        email.followUpDeadline &&
        now >= email.followUpDeadline;

    if (!isDue) continue;

    try {
      const relance = await generateFollowUp(email);
      email.followUpSent = true;
      email.status = "relance_envoyee";
      email.relanceContent = relance;
      addLog(`🔁 Relance envoyée automatiquement — ${email.subject}`);
      triggered.push(email.id);
    } catch (err) {
      addLog(`❌ Échec génération relance — ${email.subject} : ${err.message}`);
    }
  }
  return triggered;
}

export function startReminderScheduler() {
  setInterval(() => checkReminders(), CHECK_INTERVAL_MS);
}