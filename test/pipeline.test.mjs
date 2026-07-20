import test from "node:test";
import assert from "node:assert/strict";

// Utilitaire : remplace temporairement globalThis.fetch pour la durée d'un test,
// puis restaure la valeur d'origine (évite toute fuite entre tests).
function withMockFetch(mockImpl, run) {
    const original = globalThis.fetch;
    globalThis.fetch = mockImpl;
    return run().finally(() => {
        globalThis.fetch = original;
    });
}

function groqResponse(payload) {
    return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] })
    };
}

// ---------------------------------------------------------------------------
// classifyAndDraft (src/claudeClient.js)
// ---------------------------------------------------------------------------

test("classifyAndDraft — classe correctement un email de deal flow", async () => {
    await withMockFetch(
        async () =>
            groqResponse({
                categorie: "deal",
                urgence: "moyenne",
                raison_urgence: "Nouveau teaser à évaluer",
                alerte_temps_reel: false,
                necessite_relance: true,
                action_suggeree: "Étudier le teaser",
                brouillon_reponse: "Merci pour ce dossier, nous l'étudions."
            }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t1");
            const result = await classifyAndDraft({
                id: "t1", fromName: "Test", from: "t@test.fr",
                subject: "Projet Test", date: new Date().toISOString(), body: "..."
            });
            assert.equal(result.categorie, "deal");
            assert.equal(result.alerte_temps_reel, false);
            assert.equal(typeof result.brouillon_reponse, "string");
        }
    );
});

test("classifyAndDraft — détecte une urgence haute avec alerte", async () => {
    await withMockFetch(
        async () =>
            groqResponse({
                categorie: "participation",
                urgence: "haute",
                raison_urgence: "Démission du DG, crise de management",
                alerte_temps_reel: true,
                necessite_relance: false,
                action_suggeree: "Organiser un point de crise",
                brouillon_reponse: "Nous prenons rendez-vous immédiatement."
            }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t2");
            const result = await classifyAndDraft({
                id: "t2", fromName: "Test", from: "t@test.fr",
                subject: "Démission DG", date: new Date().toISOString(), body: "..."
            });
            assert.equal(result.urgence, "haute");
            assert.equal(result.alerte_temps_reel, true);
        }
    );
});

test("classifyAndDraft — ne confirme jamais un changement de RIB (garde-fou anti-fraude)", async () => {
    await withMockFetch(
        async () =>
            groqResponse({
                categorie: "lp",
                urgence: "haute",
                raison_urgence: "Demande de changement de RIB — suspicion de fraude au virement",
                alerte_temps_reel: true,
                necessite_relance: false,
                action_suggeree: "Vérifier par téléphone avant toute action",
                brouillon_reponse: "Nous ne pouvons pas confirmer cette modification par email, un rappel téléphonique est nécessaire."
            }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t3");
            const result = await classifyAndDraft({
                id: "t3", fromName: "Test", from: "t@test.fr",
                subject: "Mise à jour RIB", date: new Date().toISOString(), body: "..."
            });
            assert.match(result.brouillon_reponse.toLowerCase(), /téléphon|vérif/);
            assert.equal(/rib mis à jour|confirmé/.test(result.brouillon_reponse.toLowerCase()), false);
        }
    );
});

test("classifyAndDraft — lève une erreur si le modèle répond en texte non-JSON", async () => {
    await withMockFetch(
        async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "Désolé, je ne peux pas traiter ça." } }] })
        }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t4");
            await assert.rejects(
                () => classifyAndDraft({ id: "t4", fromName: "T", from: "t@t.fr", subject: "X", date: "", body: "" }),
                /non-JSON/
            );
        }
    );
});

test("classifyAndDraft — extrait le JSON même si le modèle ajoute une phrase avant/après", async () => {
    await withMockFetch(
        async () => ({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content:
                                "Voici l'analyse demandée :\n" +
                                JSON.stringify({
                                    categorie: "lp", urgence: "moyenne", raison_urgence: "", alerte_temps_reel: false,
                                    necessite_relance: true, action_suggeree: "Répondre", brouillon_reponse: "Bonjour, merci."
                                }) +
                                "\nN'hésitez pas si besoin."
                        }
                    }
                ]
            })
        }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t6");
            const result = await classifyAndDraft({ id: "t6", fromName: "T", from: "t@t.fr", subject: "X", date: "", body: "" });
            assert.equal(result.categorie, "lp");
            assert.equal(result.brouillon_reponse, "Bonjour, merci.");
        }
    );
});

test("classifyAndDraft — réessaie automatiquement après un 429 puis réussit", async () => {
    let callCount = 0;
    await withMockFetch(
        async () => {
            callCount++;
            if (callCount === 1) {
                return { ok: false, status: 429, text: async () => "Rate limit reached. Please try again in 0.01s." };
            }
            return groqResponse({
                categorie: "deal", urgence: "faible", raison_urgence: "", alerte_temps_reel: false,
                necessite_relance: false, action_suggeree: "", brouillon_reponse: "OK après retry."
            });
        },
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t7");
            const result = await classifyAndDraft({ id: "t7", fromName: "T", from: "t@t.fr", subject: "X", date: "", body: "" });
            assert.equal(callCount, 2, "devrait avoir réessayé une fois après le 429");
            assert.equal(result.brouillon_reponse, "OK après retry.");
        }
    );
});

test("classifyAndDraft — abandonne après plusieurs 429 consécutifs et remonte une erreur claire", async () => {
    await withMockFetch(
        async () => ({ ok: false, status: 429, text: async () => "Rate limit reached. Please try again in 0.01s." }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t8");
            await assert.rejects(
                () => classifyAndDraft({ id: "t8", fromName: "T", from: "t@t.fr", subject: "X", date: "", body: "" }),
                /429/
            );
        }
    );
});

test("classifyAndDraft — lève une erreur explicite si l'API renvoie un statut d'erreur non retryable (ex: 500)", async () => {
    await withMockFetch(
        async () => ({ ok: false, status: 500, text: async () => "Internal Server Error" }),
        async () => {
            const { classifyAndDraft } = await import("../src/claudeClient.js?t9");
            await assert.rejects(
                () => classifyAndDraft({ id: "t9", fromName: "T", from: "t@t.fr", subject: "X", date: "", body: "" }),
                /500/
            );
        }
    );
});

// ---------------------------------------------------------------------------
// sendUrgentAlert (src/alerts.js)
// ---------------------------------------------------------------------------

test("sendUrgentAlert — renvoie sent:false si Telegram n'est pas configuré", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const { sendUrgentAlert } = await import("../src/alerts.js?a1");
    const result = await sendUrgentAlert({ subject: "Test", fromName: "Test" }, "raison de test");
    assert.equal(result.sent, false);
});

test("sendUrgentAlert — envoie bien la requête à l'API Telegram quand configuré", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-token";
    process.env.TELEGRAM_CHAT_ID = "123456";
    await withMockFetch(
        async (url, options) => {
            assert.match(url, /api\.telegram\.org\/botfake-token\/sendMessage/);
            const body = JSON.parse(options.body);
            assert.equal(body.chat_id, "123456");
            assert.match(body.text, /ALERTE URGENTE/);
            return { ok: true, json: async () => ({ ok: true }) };
        },
        async () => {
            const { sendUrgentAlert } = await import("../src/alerts.js?a2");
            const result = await sendUrgentAlert({ subject: "Covenant bancaire", fromName: "LogiTrans" }, "Risque de dépassement");
            assert.equal(result.sent, true);
        }
    );
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
});

test("sendUrgentAlert — gère proprement un échec de l'API Telegram", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "fake-token";
    process.env.TELEGRAM_CHAT_ID = "123456";
    await withMockFetch(
        async () => ({ ok: false, text: async () => "Bad Request: chat not found" }),
        async () => {
            const { sendUrgentAlert } = await import("../src/alerts.js?a3");
            const result = await sendUrgentAlert({ subject: "Test", fromName: "Test" }, "raison");
            assert.equal(result.sent, false);
            assert.match(result.reason, /chat not found/);
        }
    );
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
});

// ---------------------------------------------------------------------------
// store (src/store.js)
// ---------------------------------------------------------------------------

test("store — getEmail retrouve un email par id et renvoie undefined si absent", async () => {
    const { getEmail } = await import("../src/store.js");
    const found = getEmail("email-01");
    assert.ok(found, "email-01 doit exister dans le jeu de données");
    assert.equal(found.id, "email-01");
    assert.equal(getEmail("email-inconnu"), undefined);
});

test("store — le jeu de données contient au moins 25 emails avec les champs requis", async () => {
    const { emails } = await import("../src/store.js");
    assert.ok(emails.length >= 25, `attendu >= 25 emails, trouvé ${emails.length}`);
    for (const e of emails) {
        assert.ok(e.id && e.from && e.fromName && e.subject && e.body, `email ${e.id} incomplet`);
        assert.equal(e.status, "pending");
    }
});

test("store — addLog ajoute les entrées les plus récentes en tête de liste", async () => {
    const { addLog, logs } = await import("../src/store.js");
    const before = logs.length;
    addLog("Premier événement de test");
    addLog("Second événement de test");
    assert.equal(logs.length, before + 2);
    assert.equal(logs[0].message, "Second événement de test");
    assert.ok(logs[0].time);
});

// ---------------------------------------------------------------------------
// checkReminders (src/reminders.js) — logique de relance isolée du setInterval
// ---------------------------------------------------------------------------

function makeReplyEmail(overrides = {}) {
    return {
        id: "rem-test",
        subject: "Test relance",
        fromName: "Test",
        action_suggeree: "Signer le NDA",
        status: "replied",
        necessite_relance: true,
        followUpSent: false,
        answeredByRecipient: false,
        followUpDeadline: Date.now() - 1000, // déjà dépassé
        ...overrides
    };
}

test("checkReminders — déclenche une relance quand le délai est dépassé et les conditions sont réunies", async () => {
    await withMockFetch(
        async () =>
            groqResponse({
                categorie: "deal", urgence: "faible", raison_urgence: "", alerte_temps_reel: false,
                necessite_relance: false, action_suggeree: "", brouillon_reponse: "Relance : merci de nous revenir rapidement."
            }),
        async () => {
            const { checkReminders } = await import("../src/reminders.js?r1");
            const pool = [makeReplyEmail()];
            const triggered = await checkReminders(Date.now(), pool);
            assert.deepEqual(triggered, ["rem-test"]);
            assert.equal(pool[0].followUpSent, true);
            assert.equal(pool[0].status, "relance_envoyee");
            assert.match(pool[0].relanceContent, /Relance/);
        }
    );
});

test("checkReminders — ne relance pas si le délai n'est pas encore dépassé", async () => {
    const { checkReminders } = await import("../src/reminders.js?r2");
    const pool = [makeReplyEmail({ followUpDeadline: Date.now() + 60_000 })];
    const triggered = await checkReminders(Date.now(), pool);
    assert.deepEqual(triggered, []);
    assert.equal(pool[0].followUpSent, false);
});

test("checkReminders — ne relance pas si le destinataire a déjà répondu", async () => {
    const { checkReminders } = await import("../src/reminders.js?r3");
    const pool = [makeReplyEmail({ answeredByRecipient: true })];
    const triggered = await checkReminders(Date.now(), pool);
    assert.deepEqual(triggered, []);
});

test("checkReminders — ne relance jamais deux fois le même email (garde-fou followUpSent)", async () => {
    const { checkReminders } = await import("../src/reminders.js?r4");
    const pool = [makeReplyEmail({ followUpSent: true })];
    const triggered = await checkReminders(Date.now(), pool);
    assert.deepEqual(triggered, []);
});

test("checkReminders — ignore les emails qui n'ont pas encore été répondus", async () => {
    const { checkReminders } = await import("../src/reminders.js?r5");
    const pool = [makeReplyEmail({ status: "pending" })];
    const triggered = await checkReminders(Date.now(), pool);
    assert.deepEqual(triggered, []);
});

test("checkReminders — journalise une erreur si la génération de relance échoue, sans planter", async () => {
    await withMockFetch(
        async () => ({ ok: false, status: 500, text: async () => "Erreur serveur" }),
        async () => {
            const { checkReminders } = await import("../src/reminders.js?r6");
            const pool = [makeReplyEmail({ id: "rem-fail" })];
            const triggered = await checkReminders(Date.now(), pool);
            assert.deepEqual(triggered, []);
            assert.equal(pool[0].followUpSent, false);
        }
    );
});
