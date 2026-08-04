// Adaptador HubSpot — capa desacoplada de CRM.
//
// Nada aquí sabe de agentes, del wizard ni de la UI. Solo sabe hablar con HubSpot.
// Si mañana Forward cambia de CRM, este es el único archivo que se reescribe:
// el resto del sistema (coordinador, agentes, UI) sigue llamando las mismas funciones.
//
// Todas las funciones "puras" (build*, map*) no hacen red — son fáciles de probar.
// Las funciones que sí hacen red reciben un `fetcher` inyectado (por defecto, fetch real)
// para poder probarlas sin llamar a HubSpot de verdad.

const API_BASE = "https://api.hubapi.com";

export class CRMNotConfiguredError extends Error {
  constructor() {
    super("CRM no configurado: falta la variable de entorno HUBSPOT_ACCESS_TOKEN.");
    this.code = "CRM_NOT_CONFIGURED";
  }
}

export class CRMError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/* ────────────────────────────────────────────────────────────────
   Mapeo de pipeline
   El portal real de HubSpot conectado hoy solo tiene el pipeline
   default de ventas con 7 etapas estándar (verificado vía HubSpot MCP
   el 2026-08-04): appointmentscheduled, qualifiedtobuy, presentationscheduled,
   decisionmakerboughtin, contractsent, closedwon, closedlost.
   El documento de estrategia pide 11 etapas conceptuales. Mientras no exista
   un pipeline custom "Forward AI" en HubSpot, se mapean así (documentado,
   no inventado):
   ──────────────────────────────────────────────────────────────── */
export const PIPELINE_STAGE_MAP = {
  nuevo_lead: null, // no es un deal todavía: se maneja como lifecyclestage del contacto
  lead_por_calificar: null,
  contacto_iniciado: null,
  reunion_programada: "appointmentscheduled",
  oportunidad_identificada: "qualifiedtobuy",
  prueba_de_valor: "presentationscheduled",
  propuesta: "decisionmakerboughtin",
  negociacion: "contractsent",
  ganado: "closedwon",
  perdido: "closedlost",
  expansion: null, // se maneja como deal nuevo tipo "existingbusiness", no como etapa
};

export const LIFECYCLE_STAGE_MAP = {
  nuevo_lead: "lead",
  lead_por_calificar: "marketingqualifiedlead",
  contacto_iniciado: "salesqualifiedlead",
};

export function mapDealStage(etapaForward) {
  if (!(etapaForward in PIPELINE_STAGE_MAP)) {
    throw new CRMError(`Etapa desconocida: "${etapaForward}".`, 400);
  }
  return PIPELINE_STAGE_MAP[etapaForward];
}

/* ── Builders puros (sin red, 100% testeables) ── */

export function buildContactProperties(input = {}) {
  const props = {};
  if (input.email) props.email = input.email.trim().toLowerCase();
  if (input.firstName) props.firstname = input.firstName;
  if (input.lastName) props.lastname = input.lastName;
  if (input.phone) props.phone = input.phone;
  if (input.jobTitle) props.jobtitle = input.jobTitle;
  if (input.lifecycleStage) props.lifecyclestage = input.lifecycleStage;
  if (input.leadStatus) props.hs_lead_status = input.leadStatus;
  if (input.ownerId) props.hubspot_owner_id = String(input.ownerId);
  if (input.source) props.hs_analytics_source = input.source;
  // Campos de contexto de Forward (requieren crearse como propiedades custom en HubSpot;
  // si no existen todavía, HubSpot los rechaza — ver nota en createOrUpdateContact).
  if (input.vertical) props.forward_vertical = input.vertical;
  if (input.campaign) props.forward_campaign = input.campaign;
  if (input.buyerInterest) props.forward_buyer_interest = input.buyerInterest;
  return props;
}

export function buildCompanyProperties(input = {}) {
  const props = {};
  if (input.name) props.name = input.name;
  if (input.domain) props.domain = normalizeDomain(input.domain);
  if (input.industry) props.industry = input.industry;
  if (input.teamSize) props.numberofemployees = String(input.teamSize);
  if (input.vertical) props.forward_vertical = input.vertical;
  return props;
}

export function buildDealProperties(input = {}) {
  const props = {};
  if (input.name) props.dealname = input.name;
  if (input.amount != null) props.amount = String(input.amount);
  if (input.pipeline) props.pipeline = input.pipeline;
  if (input.stage) {
    const mapped = mapDealStage(input.stage);
    if (mapped) props.dealstage = mapped;
  }
  if (input.ownerId) props.hubspot_owner_id = String(input.ownerId);
  if (input.campaign) props.forward_campaign = input.campaign;
  if (input.nextAction) props.forward_next_action = input.nextAction;
  if (input.recommendation) props.forward_agent_recommendation = input.recommendation;
  if (input.owningAgent) props.forward_owning_agent = input.owningAgent;
  return props;
}

export function normalizeDomain(website) {
  if (!website) return "";
  return website.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

/* ── Capa de red con reintentos, idempotencia y manejo de errores ── */

function getToken() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new CRMNotConfiguredError();
  return token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Extrae el nombre de propiedad de un mensaje de error de HubSpot tipo
 *  'Property "forward_vertical" does not exist' — para poder quitarla y reintentar,
 *  en vez de tronar la escritura completa por una propiedad custom que aún no se creó
 *  en el portal (ver docs/HUBSPOT_SETUP.md para crearlas de una vez). */
function extractUnknownProperty(message) {
  const m = /property\s+"([a-z0-9_]+)"\s+does not exist/i.exec(message || "");
  return m ? m[1] : null;
}

/**
 * Llama a la API de HubSpot con reintentos controlados.
 * - 429 (rate limit): respeta Retry-After, hasta 3 reintentos con backoff.
 * - 5xx: hasta 2 reintentos con backoff corto (posible falla transitoria).
 * - 401/403: no reintenta — es credencial inválida o falta de permisos.
 * - 404: no reintenta — lo maneja quien llama (normalmente significa "crear").
 * - 400 por propiedad custom inexistente: la quita del payload y reintenta UNA vez,
 *   para que un portal recién conectado (sin las propiedades forward_* creadas todavía)
 *   no rompa el registro completo — solo se pierde ese campo, nunca el contacto/deal.
 */
export async function hubspotFetch(path, opts = {}, deps = {}) {
  const fetcher = deps.fetcher || fetch;
  const token = deps.token || getToken();
  const maxRetries = opts.maxRetries ?? 3;
  let body = opts.body;
  let strippedProps = [];

  let attempt = 0;
  while (true) {
    const r = await fetcher(`${API_BASE}${path}`, {
      method: opts.method || "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (r.ok) {
      if (r.status === 204) return null;
      const json = await r.json();
      if (strippedProps.length && json && typeof json === "object") json.__strippedProperties = strippedProps;
      return json;
    }

    if (r.status === 401 || r.status === 403) {
      const data = await safeJson(r);
      throw new CRMError(
        r.status === 401
          ? "HubSpot rechazó el token (expirado o inválido). Genera uno nuevo en HubSpot → Configuración → Integraciones → Apps privadas."
          : "El token de HubSpot no tiene permisos para esta operación. Revisa los scopes de la app privada (contacts, companies, deals).",
        r.status,
        data
      );
    }

    if (r.status === 404) {
      const data = await safeJson(r);
      throw new CRMError("No encontrado en HubSpot.", 404, data);
    }

    if (r.status === 400 && body?.properties) {
      const data = await safeJson(r);
      const badProp = extractUnknownProperty(data?.message);
      if (badProp && badProp in body.properties) {
        const { [badProp]: _drop, ...rest } = body.properties;
        body = { ...body, properties: rest };
        strippedProps.push(badProp);
        continue; // reintenta de inmediato sin esa propiedad, sin contar contra maxRetries
      }
      throw new CRMError((data && data.message) || "HubSpot rechazó la solicitud (400).", 400, data);
    }

    if ((r.status === 429 || r.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(r.headers.get?.("retry-after")) || 0;
      const backoff = retryAfter ? retryAfter * 1000 : 300 * Math.pow(2, attempt);
      attempt++;
      await sleep(backoff);
      continue;
    }

    const data = await safeJson(r);
    throw new CRMError(
      (data && (data.message || data.error)) || `HubSpot respondió ${r.status}.`,
      r.status,
      data
    );
  }
}

async function safeJson(r) {
  try { return await r.json(); } catch { return null; }
}

/* ── Operaciones de alto nivel (usan el fetch con reintentos) ── */

export async function findContactByEmail(email, deps = {}) {
  if (!email) return null;
  try {
    const result = await hubspotFetch(
      "/crm/v3/objects/contacts/search",
      {
        method: "POST",
        body: {
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email.trim().toLowerCase() }] }],
          limit: 1,
        },
      },
      deps
    );
    return result?.results?.[0] || null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function upsertContact(input, deps = {}) {
  const email = input.email;
  if (!email) throw new CRMError("No se puede crear/actualizar un contacto sin correo (regla anti-duplicados).", 400);

  const existing = await findContactByEmail(email, deps);
  const properties = buildContactProperties(input);

  if (existing) {
    const updated = await hubspotFetch(`/crm/v3/objects/contacts/${existing.id}`, { method: "PATCH", body: { properties } }, deps);
    return { id: existing.id, created: false, record: updated || existing };
  }
  const created = await hubspotFetch("/crm/v3/objects/contacts", { method: "POST", body: { properties } }, deps);
  return { id: created.id, created: true, record: created };
}

export async function findCompanyByDomain(domain, deps = {}) {
  if (!domain) return null;
  const norm = normalizeDomain(domain);
  try {
    const result = await hubspotFetch(
      "/crm/v3/objects/companies/search",
      { method: "POST", body: { filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: norm }] }], limit: 1 } },
      deps
    );
    return result?.results?.[0] || null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function upsertCompany(input, deps = {}) {
  const properties = buildCompanyProperties(input);
  const domain = input.domain ? normalizeDomain(input.domain) : null;

  if (domain) {
    const existing = await findCompanyByDomain(domain, deps);
    if (existing) {
      const updated = await hubspotFetch(`/crm/v3/objects/companies/${existing.id}`, { method: "PATCH", body: { properties } }, deps);
      return { id: existing.id, created: false, record: updated || existing };
    }
  }
  const created = await hubspotFetch("/crm/v3/objects/companies", { method: "POST", body: { properties } }, deps);
  return { id: created.id, created: true, record: created };
}

export async function associateObjects(fromType, fromId, toType, toId, deps = {}) {
  // API v4 de asociaciones por default type (sin especificar typeId: HubSpot infiere la default).
  return hubspotFetch(
    `/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`,
    { method: "PUT" },
    deps
  );
}

export async function createOrUpdateDeal(input, deps = {}) {
  const properties = buildDealProperties(input);
  let dealId = input.dealId;

  let record;
  if (dealId) {
    record = await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, { method: "PATCH", body: { properties } }, deps);
  } else {
    record = await hubspotFetch("/crm/v3/objects/deals", { method: "POST", body: { properties } }, deps);
    dealId = record.id;
  }

  if (input.contactId) await associateObjects("deals", dealId, "contacts", input.contactId, deps);
  if (input.companyId) await associateObjects("deals", dealId, "companies", input.companyId, deps);

  return { id: dealId, created: !input.dealId, record };
}

export async function logNote(objectType, objectId, body, deps = {}) {
  // Crea una nota (engagement) y la asocia al objeto. Sirve como "registro de actividad".
  const note = await hubspotFetch(
    "/crm/v3/objects/notes",
    { method: "POST", body: { properties: { hs_note_body: body, hs_timestamp: Date.now() } } },
    deps
  );
  await associateObjects("notes", note.id, objectType, objectId, deps);
  return note;
}
