// Estado de la conexión (GET) y creación de diseños en Canva (POST) usando el access
// token guardado en cookie httpOnly durante /api/canva-callback. El front nunca ve el
// token — solo sabe "conectado sí/no" y, al crear un diseño, recibe la URL de edición.

import { isCanvaConfigured, createDesign, CanvaError } from "../lib/canva-adapter.js";
import { parseCookies } from "../lib/cookies.js";

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const configured = isCanvaConfigured();
  const accessToken = cookies.canva_access_token;

  if (req.method === "GET") {
    return res.status(200).json({ configured, connected: !!accessToken });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Solo GET o POST." });

  if (!configured) {
    return res.status(200).json({ error: "Canva no configurado todavía.", code: "CANVA_NOT_CONFIGURED" });
  }
  if (!accessToken) {
    return res.status(401).json({ error: "No hay una conexión activa con Canva. Dale clic a 'Conectar con Canva' primero.", code: "CANVA_NOT_CONNECTED" });
  }

  const { title, designType, width, height, assetId } = req.body || {};
  try {
    const design = await createDesign({ accessToken, title, designType, width, height, assetId });
    return res.status(200).json({ design });
  } catch (err) {
    if (err instanceof CanvaError) {
      if (err.status === 401) {
        return res.status(401).json({ error: "La conexión con Canva expiró. Vuelve a conectar.", code: "CANVA_NOT_CONNECTED" });
      }
      return res.status(err.status || 500).json({ error: err.message, details: err.details });
    }
    return res.status(500).json({ error: "Error del servidor: " + err.message });
  }
}
