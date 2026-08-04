// Puente HTTP hacia el adaptador de HubSpot. La llave vive AQUÍ, en el servidor.
// El navegador nunca ve el HUBSPOT_ACCESS_TOKEN.
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

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Estado de la integración — la UI lo usa para mostrar "CRM conectado" / "CRM no configurado".
    const configured = !!process.env.HUBSPOT_ACCESS_TOKEN;
    return res.status(200).json({ configured });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Solo GET o POST." });

  const { action, payload } = req.body || {};
  if (!action) return res.status(400).json({ error: "Falta 'action'." });

  try {
    switch (action) {
      case "upsertContact": {
        const r = await upsertContact(payload || {});
        return res.status(200).json(r);
      }
      case "upsertCompany": {
        const r = await upsertCompany(payload || {});
        return res.status(200).json(r);
      }
      case "registerOpportunity": {
        // Acción compuesta: contacto + empresa (si hay dominio) + deal + nota de contexto.
        // Es lo que dispara el botón "Registrar en HubSpot" del entregable del coordinador.
        const { contact, company, deal, note } = payload || {};
        if (!contact?.email) return res.status(400).json({ error: "Falta el correo del contacto." });

        const contactResult = await upsertContact(contact);
        let companyResult = null;
        if (company?.domain || company?.name) {
          companyResult = await upsertCompany(company);
        }
        const dealResult = await createOrUpdateDeal({
          ...deal,
          contactId: contactResult.id,
          companyId: companyResult?.id,
        });
        // La nota es "mejor esfuerzo": si tu portal no tiene el scope de notas habilitado
        // (algunos portales de HubSpot no lo exponen ni siquiera en la lista de permisos de
        // la app privada), el contacto/empresa/deal YA quedaron registrados de verdad y no
        // deben reportarse como fallidos solo porque la nota no se pudo crear.
        let noteResult = null;
        let noteWarning = null;
        if (note) {
          try {
            noteResult = await logNote("deals", dealResult.id, note);
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
        const r = await createOrUpdateDeal({ dealId, stage, nextAction, recommendation, owningAgent });
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
