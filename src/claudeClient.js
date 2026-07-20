import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

// API Groq (gratuite, compatible format OpenAI) — https://console.groq.com
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const MAX_ATTEMPTS = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Groq renvoie le délai d'attente dans le message d'erreur (ex: "Please try again in 4.9s").
// On le récupère pour attendre le bon temps plutôt qu'un délai fixe arbitraire.
function parseRetryDelayMs(errorText, attempt) {
  const match = errorText.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 250;
  return 250 * attempt; // repli si le message ne contient pas de délai exploitable
}

// Le modèle respecte parfois mal la consigne "JSON uniquement" et ajoute une phrase
// avant/après (ex: "Voici l'analyse : {...}"). On extrait le premier bloc {...} valide
// plutôt que de faire échouer tout le traitement pour une simple phrase parasite.
function extractJsonBlock(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

async function callGroq(email) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(email) }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Erreur API Groq (${response.status}) : ${errText}`);
    err.status = response.status;
    err.rawBody = errText;
    throw err;
  }
  return response;
}

export async function classifyAndDraft(email, attempt = 1) {
  let response;
  try {
    response = await callGroq(email);
  } catch (err) {
    if (err.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(parseRetryDelayMs(err.rawBody, attempt));
      return classifyAndDraft(email, attempt + 1);
    }
    throw err;
  }

  const data = await response.json();
  const raw = (data.choices?.[0]?.message?.content || "").trim();
  const cleaned = extractJsonBlock(raw.replace(/```json|```/g, "").trim());

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Réponse du modèle non-JSON : ${cleaned}`);
  }
}