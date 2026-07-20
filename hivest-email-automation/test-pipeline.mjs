// Simule une réponse Groq pour vérifier tout le pipeline sans consommer de vrai quota API.
globalThis.fetch = async (url) => {
  if (url.includes("groq.com")) {
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                categorie: "deal",
                urgence: "moyenne",
                raison_urgence: "Nouveau teaser à évaluer",
                alerte_temps_reel: false,
                necessite_relance: true,
                action_suggeree: "Étudier le teaser et répondre au banquier",
                brouillon_reponse: "Bonjour, merci pour ce dossier, nous l'étudions et revenons vers vous rapidement. L'équipe Hivest"
              })
            }
          }
        ]
      })
    };
  }
  if (url.includes("telegram.org")) {
    return { ok: true, json: async () => ({ ok: true }) };
  }
  throw new Error("URL non mockée : " + url);
};

const { classifyAndDraft } = await import("./src/claudeClient.js");
const { sendUrgentAlert } = await import("./src/alerts.js");

const sampleEmail = {
  id: "test-01",
  fromName: "Test Banquier",
  from: "test@banque.fr",
  subject: "Projet Test",
  date: new Date().toISOString(),
  body: "Ceci est un email de test."
};

console.log("1) Test classifyAndDraft...");
const result = await classifyAndDraft(sampleEmail);
console.assert(result.categorie === "deal", "categorie incorrecte");
console.assert(typeof result.brouillon_reponse === "string" && result.brouillon_reponse.length > 0, "brouillon vide");
console.log("   OK →", result);

console.log("2) Test sendUrgentAlert (sans config Telegram)...");
const alertNoConfig = await sendUrgentAlert(sampleEmail, "test");
console.assert(alertNoConfig.sent === false, "devrait échouer sans config");
console.log("   OK →", alertNoConfig);

process.env.TELEGRAM_BOT_TOKEN = "fake";
process.env.TELEGRAM_CHAT_ID = "fake";
console.log("3) Test sendUrgentAlert (avec config simulée)...");
const alertWithConfig = await sendUrgentAlert(sampleEmail, "test");
console.assert(alertWithConfig.sent === true, "devrait réussir avec config");
console.log("   OK →", alertWithConfig);

console.log("\n✅ Tous les tests du pipeline sont passés.");
