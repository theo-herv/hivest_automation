import { addLog } from "./store.js";

export async function sendUrgentAlert(email, raison) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const message =
    `🚨 ALERTE URGENTE — Hivest\n\n` +
    `De : ${email.fromName}\n` +
    `Objet : ${email.subject}\n` +
    `Raison : ${raison}\n\n` +
    `Action requise immédiatement.`;

  if (!token || !chatId) {
    addLog(`⚠️ Alerte non envoyée (Telegram non configuré) — ${email.subject}`);
    return { sent: false, reason: "Telegram non configuré (.env)" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    if (!res.ok) throw new Error(await res.text());
    addLog(`🚨 Alerte Telegram envoyée — ${email.subject}`);
    return { sent: true };
  } catch (err) {
    addLog(`❌ Échec envoi alerte Telegram — ${err.message}`);
    return { sent: false, reason: err.message };
  }
}
