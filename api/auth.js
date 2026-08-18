// Puerta de acceso a la app: hasta 3 contraseñas compartidas (ANGIE_ADMIN_PASSWORD /
// ANGIE_ADMIN2_PASSWORD / ANGIE_GUEST_PASSWORD), sin cuentas individuales ni base de datos.
// Quien entra con la de admin o admin2 puede tocar todo (CRM y Canva REALES de Forward, Mi
// negocio, panel de administración) — admin2 es una segunda cuenta con el mismo nivel de
// permisos, pedida por Angela para dar acceso propio a Ricardo Oviedo, pero su mago y sus
// proyectos se guardan aparte (prefijo "ricardo_" en el navegador, ver public/index.html)
// para que empezar de cero sin heredar la memoria de negocio ya cargada en admin. quien
// entra con la de invitada puede usar Angie, aprobar/ver su propio historial, y conectar SU
// PROPIO CRM — pero nunca toca los datos ni las integraciones reales de la administradora.
//
// GET → {autenticado, rol } según la cookie que traiga (o ninguna).
// POST { password } → valida, firma la cookie, regresa { ok:true, role }.
// POST { acción:"cerrar sesión" } → borra la cookie.

import { isSessionConfigured, roleForPassword, signSession, verifySession, SESSION_COOKIE } from "../lib/session.js";
import { parseCookies, serializeCookie, clearCookie, appendSetCookie } from "../lib/cookies.js";

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const isLocal = (req.headers.host || "").startsWith("localhost") || (req.headers.host || "").startsWith("127.0.0.1");

  si (req.method === "GET") {
    Si (!isSessionConfigured()) {
      // Sin contraseñas configuradas todavía: la aplicación funciona en modo abierto (como antes
      // de este cambio) para no dejar a Angela fuera de su propia aplicación a medio despliegue.
      return res.status(200).json({ authenticated: true, role: "admin", configured: false });
    }
    const session = verifySession(cookies[SESSION_COOKIE]);
    return res.status(200).json({ authenticated: !!session, role: session?.role || null, configured: true });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Solo GET o POST." });

  const { contraseña, acción } = req.body || {};

  si (acción === "cerrar sesión") {
    appendSetCookie(res, clearCookie(SESSION_COOKIE, { secure: !isLocal }));
    return res.status(200).json({ ok: true });
  }

  Si (!isSessionConfigured()) {
    return res.status(200).json({ error: "El acceso con contraseña todavía no está configurado en esta aplicación.", código: "AUTH_NOT_CONFIGURED" });
  }

  const rol = rolParaContraseña(contraseña);
  if (!role) return res.status(401).json({ error: "Contraseña incorrecta." });

  const cookie = signSession(role);
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, cookie, { maxAge: 60 * 60 * 24 * 30, secure: !isLocal }));
  return res.status(200).json({ ok: true, role });
}
