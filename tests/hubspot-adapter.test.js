import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContactProperties,
  buildCompanyProperties,
  buildDealProperties,
  mapDealStage,
  normalizeDomain,
  hubspotFetch,
  upsertContact,
  upsertCompany,
  CRMNotConfiguredError,
  CRMError,
} from "../lib/hubspot-adapter.js";

/* ── Builders puros ── */

test("buildContactProperties: normaliza el email y arma solo los campos presentes", () => {
  const props = buildContactProperties({ email: "  ANGIE@Forward.ai ", firstName: "Angie", vertical: "gobierno" });
  assert.equal(props.email, "angie@forward.ai");
  assert.equal(props.firstname, "Angie");
  assert.equal(props.forward_vertical, "gobierno");
  assert.equal(props.lastname, undefined);
});

test("buildCompanyProperties: normaliza el dominio", () => {
  const props = buildCompanyProperties({ name: "Forward AI", domain: "https://www.forward.ai/algo" });
  assert.equal(props.domain, "forward.ai");
  assert.equal(props.name, "Forward AI");
});

test("buildDealProperties: mapea la etapa Forward a la etapa real de HubSpot", () => {
  const props = buildDealProperties({ name: "Piloto Atizapán", stage: "reunion_programada" });
  assert.equal(props.dealstage, "appointmentscheduled");
});

test("mapDealStage: etapas pre-deal (nuevo_lead, lead_por_calificar, contacto_iniciado) devuelven null", () => {
  assert.equal(mapDealStage("nuevo_lead"), null);
  assert.equal(mapDealStage("lead_por_calificar"), null);
});

test("mapDealStage: etapa desconocida lanza CRMError 400", () => {
  assert.throws(() => mapDealStage("etapa_inventada"), (err) => err instanceof CRMError && err.status === 400);
});

test("normalizeDomain: quita protocolo, www y ruta", () => {
  assert.equal(normalizeDomain("HTTPS://WWW.Forward.AI/precios"), "forward.ai");
  assert.equal(normalizeDomain(""), "");
});

/* ── hubspotFetch: red simulada con un fetcher inyectado ── */

test("hubspotFetch: sin HUBSPOT_ACCESS_TOKEN lanza CRMNotConfiguredError", async () => {
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  await assert.rejects(() => hubspotFetch("/crm/v3/objects/contacts"), CRMNotConfiguredError);
});

test("hubspotFetch: 401 lanza CRMError sin reintentar", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: false, status: 401, headers: new Map(), json: async () => ({ message: "invalid token" }) }; };
  await assert.rejects(
    () => hubspotFetch("/x", {}, { fetcher, token: "fake" }),
    (err) => err instanceof CRMError && err.status === 401
  );
  assert.equal(calls, 1, "no debe reintentar en 401");
});

test("hubspotFetch: 429 reintenta y luego tiene éxito", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 429, headers: new Map([["retry-after", "0"]]), json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ id: "123" }) };
  };
  const result = await hubspotFetch("/x", { maxRetries: 3 }, { fetcher, token: "fake" });
  assert.equal(result.id, "123");
  assert.equal(calls, 3);
});

test("hubspotFetch: 400 por propiedad custom inexistente la quita y reintenta (no rompe el registro)", async () => {
  let calls = 0;
  const fetcher = async (url, opts) => {
    calls++;
    const body = JSON.parse(opts.body);
    if (calls === 1) {
      assert.ok("forward_vertical" in body.properties, "el primer intento sí manda la propiedad custom");
      return { ok: false, status: 400, headers: new Map(), json: async () => ({ message: 'Property "forward_vertical" does not exist' }) };
    }
    assert.ok(!("forward_vertical" in body.properties), "el segundo intento ya no manda la propiedad que HubSpot rechazó");
    assert.ok("email" in body.properties, "el resto de las propiedades se conservan");
    return { ok: true, status: 200, json: async () => ({ id: "1" }) };
  };
  const result = await hubspotFetch("/crm/v3/objects/contacts", { method: "POST", body: { properties: { email: "a@b.com", forward_vertical: "gobierno" } } }, { fetcher, token: "fake" });
  assert.equal(calls, 2);
  assert.deepEqual(result.__strippedProperties, ["forward_vertical"]);
});

test("hubspotFetch: 400 sin propiedad identificable lanza CRMError normal (no reintenta infinito)", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: false, status: 400, headers: new Map(), json: async () => ({ message: "Solicitud inválida genérica" }) }; };
  await assert.rejects(
    () => hubspotFetch("/x", { method: "POST", body: { properties: { a: 1 } } }, { fetcher, token: "fake" }),
    (err) => err instanceof CRMError && err.status === 400
  );
  assert.equal(calls, 1);
});

test("hubspotFetch: agota reintentos en 500 persistente y lanza CRMError", async () => {
  const fetcher = async () => ({ ok: false, status: 500, headers: new Map(), json: async () => ({ message: "boom" }) });
  await assert.rejects(
    () => hubspotFetch("/x", { maxRetries: 1 }, { fetcher, token: "fake" }),
    (err) => err instanceof CRMError && err.status === 500
  );
});

/* ── upsertContact: dedup por email ── */

test("upsertContact: si el email ya existe, actualiza (PATCH) en vez de crear", async () => {
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push({ url, method: opts.method });
    if (url.includes("/search")) {
      return { ok: true, status: 200, json: async () => ({ results: [{ id: "existing-1" }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: "existing-1" }) };
  };
  const result = await upsertContact({ email: "lead@gobierno.mx", firstName: "Ana" }, { fetcher, token: "fake" });
  assert.equal(result.created, false);
  assert.equal(result.id, "existing-1");
  assert.ok(calls.some((c) => c.method === "PATCH"), "debe hacer PATCH, no POST, si ya existe");
});

test("upsertContact: si el email no existe, crea (POST)", async () => {
  const fetcher = async (url, opts) => {
    if (url.includes("/search")) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    return { ok: true, status: 201, json: async () => ({ id: "new-1" }) };
  };
  const result = await upsertContact({ email: "nuevo@retail.mx" }, { fetcher, token: "fake" });
  assert.equal(result.created, true);
  assert.equal(result.id, "new-1");
});

test("upsertContact: sin email, rechaza (regla anti-duplicados)", async () => {
  await assert.rejects(() => upsertContact({ firstName: "Sin correo" }, { fetcher: async () => ({}), token: "fake" }), CRMError);
});

/* ── upsertCompany: dedup por dominio ── */

test("upsertCompany: dominio existente → PATCH", async () => {
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push({ url, method: opts.method });
    if (url.includes("/search")) return { ok: true, status: 200, json: async () => ({ results: [{ id: "co-1" }] }) };
    return { ok: true, status: 200, json: async () => ({ id: "co-1" }) };
  };
  const result = await upsertCompany({ name: "Ayuntamiento", domain: "atizapan.gob.mx" }, { fetcher, token: "fake" });
  assert.equal(result.created, false);
  assert.ok(calls.some((c) => c.method === "PATCH"));
});

console.log("Todas las pruebas del adaptador HubSpot definidas.");
