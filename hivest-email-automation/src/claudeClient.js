import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

// API Groq (gratuite, compatible format OpenAI) — https://console.groq.com
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export async function classifyAndDraft(email) {
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
    throw new Error(`Erreur API Groq (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  const raw = (data.choices?.[0]?.message?.content || "").trim();
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Réponse du modèle non-JSON : ${cleaned}`);
  }
}
