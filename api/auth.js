// Puerta de acceso a la app: 2 contraseñas compartidas (ANGIE_ADMIN_PASSWORD /
// ANGIE_GUEST_PASSWORD), sin cuentas individuales ni base de datos. Quien entra con la de
// admin puede tocar todo (CRM, Canva, Mi negocio, panel de administración). Quien entra
// con la de invitada puede usar Angie, aprobar/ver su propio historial, y conectar SU
// PROPIO CRM — pero nunca toca los datos ni las integraciones reales de la administradora.
//
// GET  → { authenticated, role } según la cookie que traiga (o ninguna).
// POST { password } → valida, firma la cookie, regresa { ok:true, role }.
// POST { action:"logout" } → borra la cookie.

import { isSessionConfigured, roleForPassword, signSession, verifySession, SESSION_COOKIE } from "../lib/session.js";
import { parseCookies, serializeCookie, clearCookie, appendSetCookie } from "../lib/cookies.js";

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const isLocal = (req.headers.host || "").startsWith("localhost") || (req.headers.host || "").startsWith("127.0.0.1");

  if (req.method === "GET") {
    if (!isSessionConfigured()) {
      // Sin contraseñas configuradas todavía: la app funciona en modo abierto (como antes
      // de este cambio) para no dejar a Angela fuera de su propia app a medio despliegue.
      return res.status(200).json({ authenticated: true, role: "admin", configured: false });
    }
    const session = verifySession(cookies[SESSION_COOKIE]);
    return res.status(200).json({ authenticated: !!session, role: session?.role || null, configured: true });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Solo GET o POST." });

  const { password, action } = req.body || {};

  if (action === "logout") {
    appendSetCookie(res, clearCookie(SESSION_COOKIE, { secure: !isLocal }));
    return res.status(200).json({ ok: true });
  }

  if (!isSessionConfigured()) {
    return res.status(200).json({ error: "El acceso con contraseña todavía no está configurado en esta app.", code: "AUTH_NOT_CONFIGURED" });
  }

  const role = roleForPassword(password);
  if (!role) return res.status(401).json({ error: "Contraseña incorrecta." });

  const cookie = signSession(role);
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, cookie, { maxAge: 60 * 60 * 24 * 30, secure: !isLocal }));
  return res.status(200).json({ ok: true, role });
}
