import test from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, roleForPassword } from "../lib/session.js";

const SECRET = "test-secret-no-es-el-real";

test("signSession + verifySession: viaje redondo con el rol correcto", () => {
  const cookie = signSession("admin", SECRET);
  const verified = verifySession(cookie, SECRET);
  assert.equal(verified.role, "admin");
});

test("verifySession: cookie manipulada (rol cambiado a mano, firma vieja reutilizada) se rechaza", () => {
  const cookie = signSession("invitada", SECRET);
  const oldSig = cookie.split(".")[1];
  const fakePayload = Buffer.from(JSON.stringify({ role: "admin", iat: Date.now() })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tampered = `${fakePayload}.${oldSig}`;
  assert.equal(verifySession(tampered, SECRET), null);
});

test("verifySession: firmada con un secret distinto se rechaza", () => {
  const cookie = signSession("admin", SECRET);
  assert.equal(verifySession(cookie, "otro-secret-distinto"), null);
});

test("verifySession: expirada (fuera de maxAgeSec) se rechaza", () => {
  const cookie = signSession("admin", SECRET);
  assert.equal(verifySession(cookie, SECRET, -1), null); // maxAge negativo = ya vencida
});

test("verifySession: vacía o basura no truena, regresa null", () => {
  assert.equal(verifySession("", SECRET), null);
  assert.equal(verifySession(null, SECRET), null);
  assert.equal(verifySession("basura-sin-punto", SECRET), null);
  assert.equal(verifySession("a.b.c.d", SECRET), null);
});

test("roleForPassword: solo compara contra las contraseñas configuradas", () => {
  process.env.ANGIE_ADMIN_PASSWORD = "clave-admin-real";
  process.env.ANGIE_GUEST_PASSWORD = "clave-invitada-real";
  assert.equal(roleForPassword("clave-admin-real"), "admin");
  assert.equal(roleForPassword("clave-invitada-real"), "invitada");
  assert.equal(roleForPassword("cualquier-otra-cosa"), null);
  assert.equal(roleForPassword(""), null);
  delete process.env.ANGIE_ADMIN_PASSWORD;
  delete process.env.ANGIE_GUEST_PASSWORD;
});
