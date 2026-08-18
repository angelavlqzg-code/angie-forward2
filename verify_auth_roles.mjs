// Verifica el acceso con contraseña de punta a punta: pantalla de login real, rol admin vs
// invitada, que invitada no vea Canva/Mi negocio/Panel admin, que sus datos NUNCA se mezclen
// con los de admin (namespace separado en localStorage), y que invitada jamás pueda usar el
// HubSpot real de la administradora (aunque el servidor lo tenga configurado).
//
// Requiere que dev-server.js corra con ANGIE_ADMIN_PASSWORD/ANGIE_GUEST_PASSWORD/
// ANGIE_SESSION_SECRET puestas (ver el bash que lanza este script).
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let failures = 0;
function ok(cond, msg) { if (cond) console.log("  ✓", msg); else { console.log("  ✗", msg); failures++; } }

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.route("**/api/hubspot", async (route) => {
    // el servidor real de esta prueba SÍ tiene HUBSPOT_ACCESS_TOKEN configurado — lo
    // dejamos pasar de verdad para probar el bloqueo real del lado del servidor.
    return route.continue();
  });
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });

  console.log("\n1. Sin sesión — aparece la pantalla de login, la app real está tapada");
  const page1 = await freshPage(browser);
  await page1.goto(BASE);
  await page1.waitForSelector("#authPw", { timeout: 3000 });
  const gateVisible = await page1.locator("#authGate").isVisible();
  ok(gateVisible, "el gate de acceso está visible antes de loguearse");
  const gateBox = await page1.locator("#authGate").boundingBox();
  const vp = page1.viewportSize();
  ok(gateBox && gateBox.width >= vp.width && gateBox.height >= vp.height, `el gate cubre toda la pantalla (obtuve ${gateBox?.width}x${gateBox?.height} vs viewport ${vp.width}x${vp.height})`);

  console.log("\n2. Contraseña incorrecta — mensaje de error, sigue pidiendo acceso");
  await page1.fill("#authPw", "esto-no-es-correcto");
  await page1.click("#authSubmit");
  await page1.waitForTimeout(400);
  const errTxt = await page1.locator("#authCard").textContent();
  ok(errTxt.includes("incorrecta"), `muestra el error real del servidor (obtuve fragmento: "${errTxt.slice(0, 80)}")`);

  console.log("\n3. Login como admin — entra, ve el badge de rol y los botones admin");
  await page1.fill("#authPw", "clave-admin-e2e");
  await page1.click("#authSubmit");
  await page1.waitForSelector(".hero", { timeout: 4000 });
  await page1.waitForFunction(() => document.getElementById("roleBadge").textContent.trim().length > 0, { timeout: 4000 });
  const badgeTxt = await page1.locator("#roleBadge").textContent();
  ok(badgeTxt.includes("Admin"), `el badge dice Admin (obtuve "${badgeTxt}")`);
  ok(await page1.locator("#wizBtn").isVisible(), "admin ve 'Mi negocio'");
  ok(await page1.locator("#adminBtn").isVisible(), "admin ve el botón de Panel de administración");
  ok(await page1.locator("#canvaPill").isVisible(), "admin ve el pill de Canva");

  console.log("\n4. Admin genera un proyecto real, se guarda en su namespace");
  await page1.route("**/api/chat", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: `[ENTENDI]\nProyecto real de admin.\n\n[AGENTES]\nA1\n\n[PASOS]\n[{"code":"A1","accion":"x","documento":null,"resultado":"y","depende_de":null}]\n\n[ENTREGABLE]\nEntregable admin.\n\n[APROBACION]\nNada por ahora.\n\n[SIGUIENTE]\nListo.` }) }));
  await page1.fill("#q", "Encargo real de la administradora");
  await page1.click("#go");
  await page1.waitForSelector(".coord", { timeout: 5000 });
  const adminRuns = await page1.evaluate(() => JSON.parse(localStorage.getItem("forwardai_runs_v1") || "[]"));
  ok(adminRuns.length === 1 && adminRuns[0].request.includes("administradora"), `el proyecto de admin quedó en la key SIN prefijo (obtuve ${adminRuns.length} runs)`);
  await page1.close();

  console.log("\n5. Nueva sesión (navegador limpio) — login como invitada");
  const page2 = await freshPage(browser);
  await page2.goto(BASE);
  await page2.waitForSelector("#authPw", { timeout: 3000 });
  await page2.fill("#authPw", "clave-invitada-e2e");
  await page2.click("#authSubmit");
  await page2.waitForSelector(".hero", { timeout: 4000 });
  await page2.waitForFunction(() => document.getElementById("roleBadge").textContent.trim().length > 0, { timeout: 4000 });
  const badgeTxt2 = await page2.locator("#roleBadge").textContent();
  ok(badgeTxt2.includes("Invitada"), `el badge dice Invitada (obtuve "${badgeTxt2}")`);
  // Pedido de Angela: invitada SÍ debe poder abrir el wizard ("Mi negocio") — antes no tenía
  // ninguna forma de arrancar un proyecto guiado, solo texto libre. Es seguro porque sus
  // respuestas se guardan en su propio namespace ("guest_..."), nunca tocan las de admin.
  ok(await page2.locator("#wizBtn").isVisible(), "invitada SÍ ve el botón 'Mi negocio' (puede arrancar su propio wizard)");
  ok(!(await page2.locator("#adminBtn").isVisible()), "invitada NO ve el Panel de administración");
  ok(!(await page2.locator("#canvaPill").isVisible()), "invitada NO ve el pill de Canva");
  ok(await page2.locator("#crmPill").isVisible(), "invitada SÍ ve el pill de CRM (para conectar su propia llave)");
  ok(await page2.locator("#aprBtn").isVisible(), "invitada SÍ ve Aprobaciones");
  ok(await page2.locator("#measureBtn").isVisible(), "invitada SÍ ve Medición");
  const wizardAutoOpened = await page2.locator("#wizardModal.open").isVisible().catch(() => false);
  ok(!wizardAutoOpened, "a invitada NO se le abre el wizard solo (no queremos ser intrusivos con quien solo prueba)");

  // Pero si ella misma le da clic, sí se abre — y su propio namespace sigue aislado.
  await page2.click("#wizBtn");
  await page2.waitForSelector("#wizardModal.open", { timeout: 3000 });
  ok(true, "invitada SÍ puede abrir el wizard manualmente con el botón");
  await page2.click("#wizClose");
  await page2.waitForSelector("#wizardModal.open", { state: "hidden", timeout: 3000 });
  const noAdminWizardKeyHere = await page2.evaluate(() => localStorage.getItem("forwardai_wizard_v1") === null);
  ok(noAdminWizardKeyHere, "y abrirlo/cerrarlo NO crea ninguna key de wizard sin prefijo (namespace de invitada sigue aislado)");

  console.log("\n6. Invitada intenta registrar en HubSpot SIN conectar su propia llave — el servidor la bloquea de verdad");
  await page2.route("**/api/chat", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: `[ENTENDI]\nProyecto de invitada.\n\n[AGENTES]\nA1\n\n[PASOS]\n[{"code":"A1","accion":"x","documento":null,"resultado":"y","depende_de":null}]\n\n[ENTREGABLE]\nEntregable invitada.\n\n[APROBACION]\nNada por ahora.\n\n[HUBSPOT]\n{"contact":{"email":"prueba@invitada.mx"},"deal":{"name":"Prueba"}}\n\n[SIGUIENTE]\nListo.` }) }));
  await page2.fill("#q", "Encargo de prueba de la invitada");
  await page2.click("#go");
  await page2.waitForSelector("#hsBtn", { timeout: 5000 });
  await page2.click("#hsBtn");
  await page2.waitForTimeout(400);
  const hsBtnTxt = await page2.locator("#hsBtn").textContent();
  ok(hsBtnTxt.includes("no configurado") || hsBtnTxt.includes("CRM"), `sin llave propia, el servidor bloqueó el registro real (botón dice "${hsBtnTxt}")`);

  console.log("\n7. Los datos de invitada quedan en su propio namespace, NUNCA junto a los de admin");
  const guestRuns = await page2.evaluate(() => JSON.parse(localStorage.getItem("guest_forwardai_runs_v1") || "[]"));
  const adminRunsInGuestBrowser = await page2.evaluate(() => localStorage.getItem("forwardai_runs_v1"));
  ok(guestRuns.length === 1 && guestRuns[0].request.includes("invitada"), `el proyecto de invitada quedó en la key CON prefijo guest_ (obtuve ${guestRuns.length} runs)`);
  ok(!adminRunsInGuestBrowser, "en este navegador de invitada no existe ninguna key sin prefijo (nunca tocó los datos de admin)");

  console.log("\n8. Cerrar sesión de invitada regresa al gate");
  await page2.click("#logoutBtn");
  await page2.waitForSelector("#authPw", { timeout: 4000 });
  ok(await page2.locator("#authGate").isVisible(), "tras 'Salir', vuelve a pedir contraseña");

  await page2.close();
  await browser.close();

  console.log(failures ? `\n${failures} FALLA(S)` : "\nTODO OK — acceso con contraseña, roles y aislamiento de datos verificados de punta a punta.");
  process.exit(failures ? 1 : 0);
})();
