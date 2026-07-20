import { emails, addLog } from "./store.js";
import { classifyAndDraft } from "./claudeClient.js";

const CHECK_INTERVAL_MS = 5000;

// Génère un message de relance contextualisé via Claude
async function generateFollowUp(email) {
  const followUpEmail = {
    ...email,
    subject: `Relance : ${email.subject}`,
    body: `Ceci est une demande de relance automatique : nous n'avons pas reçu de réponse à notre message "${email.subject}" envoyé précédemment. Rédige une relance courte, polie et professionnelle qui rappelle la demande initiale (${email.action_suggeree}) et demande un retour rapide.`
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