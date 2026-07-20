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

export function startReminderScheduler() {
  setInterval(async () => {
    const now = Date.now();
    for (const email of emails) {
      if (
        email.status === "replied" &&
        email.necessite_relance &&
        !email.followUpSent &&
        !email.answeredByRecipient &&
        email.followUpDeadline &&
        now >= email.followUpDeadline
      ) {
        try {
          const relance = await generateFollowUp(email);
          email.followUpSent = true;
          email.status = "relance_envoyee";
          addLog(`🔁 Relance envoyée automatiquement — ${email.subject}`);
          email.relanceContent = relance;
        } catch (err) {
          addLog(`❌ Échec génération relance — ${email.subject} : ${err.message}`);
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}
