// Puente HTTP hacia el adaptador de HubSpot.
//
// Dos formas de tener un token: el de Vercel (HUBSPOT_ACCESS_TOKEN, puesto por quien
// despliega la app) o el que la propia usuaria pega desde el panel "Conectar CRM" en la
// app — ese viaja en el header x-hubspot-token y nunca se guarda en el servidor, solo se
// usa para la llamada en curso.
//
// REGLA DE AISLAMIENTO POR ROL (importante, no tocar sin pensarlo dos veces): el rol viene
// de la cookie de sesión FIRMADA — nunca del cliente sin verificar, para que nadie pueda
// mentir diciendo que es "admin". Si el rol es "invitada", el token de Vercel (la cuenta
// REAL de HubSpot de la administradora) NUNCA se usa como respaldo — invitada solo puede
// escribir en HubSpot si trajo su propio token. Así, quien prueba la app con la contraseña
// de invitada jamás puede tocar los datos reales de HubSpot de Forward AI, aunque el token
// de Vercel esté configurado.
//
// Un solo endpoint, ruteado por `action`, igual de simple que /api/chat y /api/imagen.
// Todas las escrituras masivas o sensibles se deciden en el front (botón "Registrar en
// HubSpot" que el humano pulsa después de ver el entregable) — este archivo no decide
// nada por sí mismo, solo ejecuta lo que ya se aprobó.

import {
  CRMNotConfiguredError,
  CRMError,
  upsertContact,
  upsertCompany,
  createOrUpdateDeal,
  logNote,
} from "../lib/hubspot-adapter.js";
import { verifySession, SESSION_COOKIE } from "../lib/session.js";
import { parseCookies } from "../lib/cookies.js";

export const config = { maxDuration: 30 };

function clientToken(req) {
  const t = req.headers?.["x-hubspot-token"];
  return t && String(t).trim() ? String(t).trim() : null;
}

function sessionRole(req) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies[SESSION_COOKIE]);
  return session?.role || null; // null = sin sesión (app en modo abierto, ver api/auth.js) → se trata como admin
}

export default async function handler(req, res) {
  const token = clientToken(req);
  const role = sessionRole(req);
  const isGuest = role === "invitada";

  if (req.method === "GET") {
    // Estado de la integración — la UI lo usa para mostrar "CRM conectado" / "CRM no configurado".
    // Para invitada, el token de Vercel de la administradora NO cuenta como "conectado":
    // solo su propio token la conecta a algo.
    const serverConfigured = !isGuest && !!process.env.HUBSPOT_ACCESS_TOKEN;
    const configured = serverConfigured || !!token;
    const source = token ? "cliente" : serverConfigured ? "servidor" : null;
    return res.status(200).json({ configured, source });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Solo GET o POST." });

  const { action, payload } = req.body || {};
  if (!action) return res.status(400).json({ error: "Falta 'action'." });

  if (isGuest && !token) {
    return res.status(200).json({
      error: "Como invitada, necesitas conectar tu propio CRM primero (botón 'CRM' en el header) — no se usa la cuenta real de la administradora.",
      code: "CRM_NOT_CONFIGURED",
    });
  }
  const deps = token ? { token } : {};

  try {
    switch (action) {
      case "upsertContact": {
        const r = await upsertContact(payload || {}, deps);
        return res.status(200).json(r);
      }
      case "upsertCompany": {
        const r = await upsertCompany(payload || {}, deps);
        return res.status(200).json(r);
      }
      case "registerOpportunity": {
        // Acción compuesta: contacto + empresa (si hay dominio) + deal + nota de contexto.
        // Es lo que dispara el botón "Registrar en HubSpot" del entregable del coordinador.
        const { contact, company, deal, note } = payload || {};
        if (!contact?.email) return res.status(400).json({ error: "Falta el correo del contacto." });

        const contactResult = await upsertContact(contact, deps);
        let companyResult = null;
        if (company?.domain || company?.name) {
          companyResult = await upsertCompany(company, deps);
        }
        const dealResult = await createOrUpdateDeal({
          ...deal,
          contactId: contactResult.id,
          companyId: companyResult?.id,
        }, deps);
        // La nota es "mejor esfuerzo": si tu portal no tiene el scope de notas habilitado
        // (algunos portales de HubSpot no lo exponen ni siquiera en la lista de permisos de
        // la app privada), el contacto/empresa/deal YA quedaron registrados de verdad y no
        // deben reportarse como fallidos solo porque la nota no se pudo crear.
        let noteResult = null;
        let noteWarning = null;
        if (note) {
          try {
            noteResult = await logNote("deals", dealResult.id, note, deps);
          } catch (noteErr) {
            noteWarning =
              "El contacto, la empresa y el deal sí se registraron en HubSpot. La nota de " +
              "contexto no se pudo crear (probablemente falta el scope de notas en tu app " +
              "privada de HubSpot) — puedes agregarla manualmente en el deal si quieres: " +
              noteErr.message;
          }
        }
        return res.status(200).json({
          contact: contactResult,
          company: companyResult,
          deal: dealResult,
          note: noteResult,
          noteWarning,
        });
      }
      case "updateDealStage": {
        const { dealId, stage, nextAction, recommendation, owningAgent } = payload || {};
        if (!dealId || !stage) return res.status(400).json({ error: "Falta dealId o stage." });
        const r = await createOrUpdateDeal({ dealId, stage, nextAction, recommendation, owningAgent }, deps);
        return res.status(200).json(r);
      }
      default:
        return res.status(400).json({ error: `Acción desconocida: "${action}".` });
    }
  } catch (err) {
    if (err instanceof CRMNotConfiguredError) {
      return res.status(200).json({ error: err.message, code: "CRM_NOT_CONFIGURED" });
    }
    if (err instanceof CRMError) {
      return res.status(err.status || 500).json({ error: err.message, details: err.details });
    }
    return res.status(500).json({ error: "Error del servidor: " + err.message });
  }
}
