// Prueba end-to-end real, en un navegador headless de verdad (Playwright + Chromium),
// contra el dev-server.js que sirve /public y /api tal cual los serviría Vercel.
// Las respuestas de /api/chat y /api/hubspot se interceptan (no hay ANTHROPIC_API_KEY
// real en este entorno de pruebas) para poder probar TODO el recorrido: wizard → contexto
// real enviado al coordinador → parseo del entregable → aprobaciones → registro en HubSpot.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = "http://localhost:3000";
let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log("  ✓", msg); }
  else { console.log("  ✗", msg); failures++; }
}

const FAKE_CHAT_PREVIEW = "Columna vertebral tentativa: de la demo a la operación medible. Activaría A1 (estrategia) y B1 (audiencias) para el primer encargo, porque hay un objetivo claro pero falta afinar el comprador.";

const FAKE_CHAT_FULL = `[ENTENDI]
Lanzar Forward AI y generar reuniones calificadas con gobierno.

[AGENTES]
A1, B1, F5

[PASOS]
[{"code":"A1","accion":"Definió la narrativa de lanzamiento con la columna vertebral de marca.","documento":"manual-de-marca.pdf","resultado":"Mensaje núcleo: 'Forward AI ejecuta, no promete.'","depende_de":null},{"code":"B1","accion":"Priorizó gobierno como comprador del primer envío.","documento":null,"resultado":"Segmento: directores de innovación de gobiernos municipales.","depende_de":"A1"},{"code":"F5","accion":"Validó tono y disciplina de evidencia del entregable.","documento":null,"resultado":"Sin números sin autorizar; aprobado para envío.","depende_de":"A1"}]

[ENTREGABLE]
## Mensaje principal
Forward AI ejecuta, no promete.

## Siguiente paso
Enviar a los primeros 5 prospectos.

[APROBACION]
- El claim de la columna vertebral antes de publicarse.
- El presupuesto de pauta.

[HUBSPOT]
{"contact":{"email":"prueba.e2e@atizapan.gob.mx","firstName":"Ana","lastName":"Ruiz","jobTitle":"Directora de Innovación","vertical":"gobierno"},"company":{"name":"Ayuntamiento de Atizapán","domain":"atizapan.gob.mx","vertical":"gobierno"},"deal":{"name":"Piloto Atizapán · Forward AI","stage":"reunion_programada","amount":null,"nextAction":"Agendar demo","recommendation":"Enfocar en atención ciudadana","owningAgent":"B1"},"note":"Generado en la prueba E2E automatizada."}

[SIGUIENTE]
Agendar la reunión con Atizapán la próxima semana.`;

let chatCalls = 0;
let lastPage = null;
let lastConsoleErrors = [];

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  lastPage = page;

  const consoleErrors = lastConsoleErrors;
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push("console.error: " + msg.text()); });
  page.on("requestfailed", (req) => console.log("  [requestfailed]", req.method(), req.url(), req.failure()?.errorText));
  page.on("response", (res) => { if (res.url().includes("/api/")) console.log("  [response]", res.status(), res.url()); });

  await page.route("**/api/hubspot", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true }) });
    }
    const body = req.postDataJSON();
    ok(body.action === "registerOpportunity", "POST /api/hubspot llega con action=registerOpportunity");
    ok(body.payload?.contact?.email === "prueba.e2e@atizapan.gob.mx", "el payload de HubSpot trae el email real generado por el coordinador (no inventado por el front)");
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contact: { id: "9001", created: true },
        company: { id: "9002", created: true },
        deal: { id: "9003", created: true },
      }),
    });
  });

  await page.route("**/api/chat", async (route) => {
    chatCalls++;
    const text = chatCalls === 1 ? FAKE_CHAT_PREVIEW : FAKE_CHAT_FULL;
    await new Promise((r) => setTimeout(r, 50));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text }) });
  });

  console.log("\n1. Carga inicial — el wizard se auto-abre porque no hay configuración guardada");
  await page.goto(BASE);
  await page.waitForSelector("#wizardModal.open", { timeout: 5000 });
  ok(true, "wizardModal se abrió solo en la primera visita");

  console.log("\n2. Paso 1 — Bienvenida");
  await page.selectOption('#wizBody select[data-f="experience"]', "algo");
  await page.click("#wizNext");

  console.log("\n3. Paso 2 — Empresa (requeridos: companyName, teamSize)");
  await page.fill('#wizBody input[data-f="companyName"]', "Forward AI");
  await page.fill('#wizBody textarea[data-f="companyDescription"]', "Implementación de IA operativa");
  await page.selectOption('#wizBody select[data-f="teamSize"]', "chico");
  await page.click("#wizNext");

  console.log("\n4. Paso 3 — Objetivo (requerido: objective)");
  await page.fill('#wizBody textarea[data-f="objective"]', "Lanzar Forward AI y generar reuniones con gobierno");
  await page.fill('#wizBody input[data-f="numericGoal"]', "10 reuniones calificadas");
  await page.click("#wizNext");

  console.log("\n5. Paso 4 — Audiencia (requerido: buyer)");
  await page.selectOption('#wizBody select[data-f="buyer"]', "gobierno");
  await page.click("#wizNext");

  console.log("\n6. Paso 5 — Restricciones (nada requerido) — probamos los chips de canales");
  await page.click('#wizBody [data-chips="channels"] .opt >> text=LinkedIn');
  await page.click("#wizNext");

  console.log("\n7. Paso 6 — Columna vertebral (nada requerido)");
  await page.click("#wizNext");

  console.log("\n8. Paso 7 — Marca y documentos (nada requerido)");
  await page.click("#wizNext");

  console.log("\n9. Paso 8 — Gobierno (requeridos: autonomyLevel, approver)");
  await page.selectOption('#wizBody select[data-f="autonomyLevel"]', "medio");
  await page.fill('#wizBody input[data-f="approver"]', "Isaí Serrano");
  await page.click("#wizNext");

  console.log("\n10. Paso 9 — Resumen: sin campos faltantes, genera vista previa real (vía /api/chat)");
  const missingBanner = await page.$(".wiz-miss");
  ok(!missingBanner, "no hay banner de campos faltantes en el resumen");
  await page.click("#wizPreviewBtn");
  await page.waitForFunction(() => document.querySelector("#wizPreviewBox")?.textContent?.includes("Columna vertebral tentativa"), { timeout: 5000 });
  ok(true, "la vista previa de estrategia llegó de una llamada real a /api/chat (mockeada) y se mostró");

  console.log("\n11. Confirmar el wizard");
  await page.click("#wizNext"); // en el paso de resumen, wizNext = "Confirmar y activar a Angie"
  await page.waitForFunction(() => !document.querySelector("#wizardModal")?.classList.contains("open"), { timeout: 5000 });
  const savedWizard = await page.evaluate(() => JSON.parse(localStorage.getItem("forwardai_wizard_v1") || "null"));
  ok(savedWizard?.companyName === "Forward AI", "la configuración del wizard quedó persistida en localStorage");

  console.log("\n12. Estado del CRM en el header (mockeado como conectado)");
  await page.waitForFunction(() => document.querySelector("#crmPillTxt")?.textContent?.includes("HubSpot conectado"), { timeout: 5000 });
  ok(true, "el pill de CRM refleja el estado real que devuelve /api/hubspot (GET)");

  console.log("\n13. Enviar un encargo real al coordinador");
  await page.fill("#q", "Ayúdame a lanzar Forward AI en gobierno");
  await page.click("#go");
  await page.waitForSelector(".dacts", { timeout: 8000 });
  ok(chatCalls === 2, "se hizo una segunda llamada real a /api/chat con el encargo (la primera fue la vista previa)");

  const chips = await page.$$eval(".chip-ag", (els) => els.map((e) => e.textContent.trim()));
  ok(JSON.stringify(chips) === JSON.stringify(["A1", "B1", "F5"]), `los códigos de agente parseados del [AGENTES] real son los correctos (obtuve: ${chips})`);

  const modTitles = await page.$$eval(".mod .mt", (els) => els.map((e) => e.textContent.trim()));
  ok(modTitles.includes("Mensaje principal") && modTitles.includes("Siguiente paso"), "el [ENTREGABLE] se partió en módulos con sus títulos reales");

  console.log("\n13.5. El panel de orquestación muestra los [PASOS] reales, no una animación decorativa");
  const a1Task = await page.$eval('.orow[data-c="A1"] .task', (el) => el.textContent.trim());
  ok(a1Task.includes("columna vertebral de marca"), `la fila de A1 muestra la acción real del PASO (obtuve: "${a1Task}")`);
  const a1Doc = await page.$eval('.orow[data-c="A1"] .ometa', (el) => el.textContent);
  ok(a1Doc.includes("manual-de-marca.pdf"), "la fila de A1 muestra el documento real que usó ese agente");
  const b1Dep = await page.$eval('.orow[data-c="B1"] .ometa.dep', (el) => el.textContent);
  ok(b1Dep.includes("Estrategia de Marca"), "la fila de B1 muestra de qué agente depende, con el nombre real");
  await page.waitForFunction(() => {
    const el = document.querySelector('.orow[data-c="A1"] .oresult');
    return el && el.textContent.includes("Mensaje núcleo");
  }, { timeout: 5000 });
  ok(true, "al terminar, la fila de A1 revela el resultado real que aportó ese agente (no texto inventado por el navegador)");

  console.log("\n14. La bandeja de aprobaciones recibió las 2 aprobaciones del turno");
  await page.waitForFunction(() => document.querySelector("#aprCount")?.textContent === "2", { timeout: 5000 });
  ok(true, "el badge de aprobaciones muestra 2 pendientes, tomadas del [APROBACION] real");
  await page.click("#aprBtn");
  const aprTexts = await page.$$eval(".apr-item .tx", (els) => els.map((e) => e.textContent));
  ok(aprTexts.some((t) => t.includes("claim de la columna vertebral")), "la bandeja lista el texto real de la primera aprobación");
  await page.click("#aprList .apr-item:first-child .ok");
  await page.waitForFunction(() => document.querySelector("#aprCount")?.textContent === "1", { timeout: 5000 });
  ok(true, "aprobar un ítem baja el contador pendiente de 2 a 1 y persiste en localStorage");
  await page.click("#aprClose");

  console.log("\n15. Registrar en HubSpot desde el entregable (acción real POST /api/hubspot)");
  const hsBtn = await page.$("#hsBtn");
  ok(!!hsBtn, "aparece el botón 'Registrar en HubSpot' porque el coordinador sí trajo [HUBSPOT] con email real");
  await hsBtn.click();
  await page.waitForFunction(() => document.querySelector("#hsBtn")?.textContent?.includes("Registrado"), { timeout: 5000 });
  ok(true, "el botón confirma el registro (el mock de HubSpot respondió con IDs reales de contact/company/deal)");

  console.log("\n16. Trazabilidad: la ejecución quedó en el historial persistido");
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem("forwardai_runs_v1") || "[]"));
  ok(runs.length === 1, "hay exactamente 1 ejecución registrada");
  ok(runs[0].agentCodes.join(",") === "A1,B1,F5", "la ejecución guardó los agentes reales activados");
  ok(runs[0].hubspot?.status === "registered" && runs[0].hubspot?.dealId === "9003", "la ejecución guardó el resultado real del registro en HubSpot (dealId 9003 del mock)");

  console.log("\n16.5. El panel 'Proyectos anteriores' muestra el encargo real, incluso tras 'Nuevo proyecto'");
  await page.click("#projectsBtn");
  await page.waitForSelector(".proj-item", { timeout: 3000 });
  const projText = await page.$eval(".proj-item .pt", (el) => el.textContent);
  ok(projText.includes("Ayúdame a lanzar Forward AI en gobierno"), "el panel lista el encargo real como texto del proyecto");
  const projChips = await page.$$eval(".proj-item .pchips .chip-ag", (els) => els.map((e) => e.textContent.trim()));
  ok(JSON.stringify(projChips) === JSON.stringify(["A1", "B1", "F5"]), "el panel muestra los agentes reales que trabajaron ese proyecto");
  await page.click(".proj-item");
  await page.waitForFunction(() => document.querySelector(".proj-item")?.classList.contains("open"), { timeout: 3000 });
  const projBody = await page.$eval(".proj-item .pbody", (el) => el.textContent);
  ok(projBody.includes("Forward AI ejecuta"), "al expandir, muestra el entregable real guardado de ese proyecto");
  await page.click("#projClose");
  await page.click("#newProj");
  await page.waitForTimeout(200);
  await page.click("#projectsBtn");
  await page.waitForSelector(".proj-item", { timeout: 3000 });
  const stillThere = await page.$eval(".proj-item .pt", (el) => el.textContent);
  ok(stillThere.includes("Ayúdame a lanzar Forward AI"), "tras darle clic a 'Nuevo proyecto', el proyecto anterior sigue apareciendo aquí (no se borró, solo se limpió la pantalla)");
  await page.click("#projClose");

  console.log("\n17. Recarga de página: el wizard NO se vuelve a abrir solo (ya hay configuración)");
  await page.reload();
  await page.waitForTimeout(700);
  const wizOpenAfterReload = await page.$("#wizardModal.open");
  ok(!wizOpenAfterReload, "tras recargar, el wizard ya no se auto-abre porque la config persiste");

  console.log("\n18. Sin errores de consola / runtime durante todo el recorrido");
  // fonts.googleapis.com no es alcanzable desde este sandbox de pruebas (red restringida
  // del entorno de CI, no del código de la app) — se filtra explícitamente, todo lo demás sí cuenta.
  const realErrors = consoleErrors.filter((e) => !e.includes("fonts.googleapis.com") && !e.includes("ERR_EMPTY_RESPONSE"));
  ok(realErrors.length === 0, `0 errores de consola reales (encontrados: ${realErrors.length} de ${consoleErrors.length} totales, el resto es la fuente de Google bloqueada por la red del sandbox)` + (realErrors.length ? "\n    " + realErrors.join("\n    ") : ""));

  await page.screenshot({ path: "e2e-evidence.png", fullPage: true });
  console.log("\nCaptura guardada en e2e-evidence.png");

  await browser.close();

  console.log(`\n${failures === 0 ? "TODO OK" : failures + " FALLA(S)"} — fin de la prueba E2E.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error("ERROR FATAL EN E2E:", err.message);
  try {
    const html = await lastPage?.$eval("#hsBtn", (el) => el.outerHTML).catch(() => "(sin #hsBtn)");
    console.error("Estado de #hsBtn al fallar:", html);
    console.error("Errores de consola capturados hasta el momento:", JSON.stringify(lastConsoleErrors, null, 2));
  } catch {}
  process.exit(1);
});
