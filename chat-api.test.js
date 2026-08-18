import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/chat.js";

// api/chat.js reenvía cada mensaje a Anthropic. Para poder probarlo sin gastar la llave real
// ni depender de internet, sustituimos fetch por una versión falsa que solo GUARDA lo que
// le mandaron, y contesta con una respuesta de éxito mínima.
function fakeReqRes(body) {
  const req = { method: "POST", body };
  const state = { statusCode: null, jsonBody: null };
  const res = {
    status(code) { state.statusCode = code; return this; },
    json(obj) { state.jsonBody = obj; return this; },
  };
  return { req, res, state };
}

async function withFakeFetch(fn) {
  const realFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "ok" }] }) };
  };
  try { await fn(() => captured); } finally { global.fetch = realFetch; }
}

test("api/chat: el system prompt (string) se envuelve con cache_control ephemeral", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  await withFakeFetch(async (getCaptured) => {
    const { req, res } = fakeReqRes({ system: "Eres Angie...", messages: [{ role: "user", content: "hola" }] });
    await handler(req, res);
    const sent = getCaptured();
    assert.ok(Array.isArray(sent.body.system), "system se convirtió en arreglo de bloques");
    assert.equal(sent.body.system[0].text, "Eres Angie...");
    assert.deepEqual(sent.body.system[0].cache_control, { type: "ephemeral" });
  });
});

test("api/chat: el ÚLTIMO bloque de contenido del PRIMER mensaje (donde van los documentos del wizard) recibe cache_control", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  await withFakeFetch(async (getCaptured) => {
    const req0content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "AAAA" } },
      { type: "text", text: "contexto del negocio" },
    ];
    const { req, res } = fakeReqRes({
      system: "Eres Angie...",
      messages: [
        { role: "user", content: req0content },
        { role: "assistant", content: "Entendido." },
        { role: "user", content: "siguiente encargo" },
      ],
    });
    await handler(req, res);
    const sent = getCaptured();
    const firstMsg = sent.body.messages[0];
    assert.equal(firstMsg.content.length, 2, "no se perdió ningún bloque de contenido");
    assert.equal(firstMsg.content[0].cache_control, undefined, "el bloque del documento (no es el último) no lleva cache_control");
    assert.deepEqual(firstMsg.content[1].cache_control, { type: "ephemeral" }, "el último bloque (el texto de contexto) sí lleva cache_control — cachea todo lo anterior, incluido el PDF");
    // Los mensajes que NO son el primero no se tocan.
    assert.equal(sent.body.messages[1].content, "Entendido.");
    assert.equal(sent.body.messages[2].content, "siguiente encargo");
  });
});

test("api/chat: si el primer mensaje no trae contenido en arreglo (texto plano), no truena y lo manda tal cual", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  await withFakeFetch(async (getCaptured) => {
    const { req, res, state } = fakeReqRes({ system: "Eres Angie...", messages: [{ role: "user", content: "hola sin documentos" }] });
    await handler(req, res);
    const sent = getCaptured();
    assert.equal(sent.body.messages[0].content, "hola sin documentos");
    assert.equal(state.statusCode, 200);
  });
});

test("api/chat: sigue respondiendo el texto de la IA como antes (no rompimos el camino feliz)", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  await withFakeFetch(async () => {
    const { req, res, state } = fakeReqRes({ system: "s", messages: [{ role: "user", content: "hola" }] });
    await handler(req, res);
    assert.equal(state.statusCode, 200);
    assert.equal(state.jsonBody.text, "ok");
  });
});
