import test from "node:test";
import assert from "node:assert/strict";
import { createStore, makeMemoryStorage } from "../public/store.js";

test("wizard: guarda y recupera; null si nunca se guardó", () => {
  const store = createStore(makeMemoryStorage());
  assert.equal(store.loadWizardData(), null);
  store.saveWizardData({ companyName: "Forward AI" });
  assert.deepEqual(store.loadWizardData(), { companyName: "Forward AI" });
});

test("runs: addRun agrega al principio (más reciente primero)", () => {
  const store = createStore(makeMemoryStorage());
  store.addRun({ id: "1", text: "primero" });
  store.addRun({ id: "2", text: "segundo" });
  const runs = store.loadRuns();
  assert.equal(runs[0].id, "2");
  assert.equal(runs[1].id, "1");
});

test("runs: updateRun aplica un patch parcial", () => {
  const store = createStore(makeMemoryStorage());
  store.addRun({ id: "1", status: "running" });
  const updated = store.updateRun("1", { status: "done", hubspot: { contactId: "abc" } });
  assert.equal(updated.status, "done");
  assert.equal(store.loadRuns()[0].hubspot.contactId, "abc");
});

test("runs: updateRun con id inexistente devuelve null y no rompe nada", () => {
  const store = createStore(makeMemoryStorage());
  assert.equal(store.updateRun("no-existe", { status: "x" }), null);
});

test("approvals: addApprovals crea items pending con id único", () => {
  const store = createStore(makeMemoryStorage());
  const created = store.addApprovals(["Publicar el post", "Lanzar la pauta"]);
  assert.equal(created.length, 2);
  assert.equal(created[0].status, "pending");
  assert.notEqual(created[0].id, created[1].id);
});

test("approvals: setApprovalStatus cambia el estado y sella decidedAt", () => {
  const store = createStore(makeMemoryStorage());
  const [a] = store.addApprovals(["Publicar el post"]);
  const updated = store.setApprovalStatus(a.id, "approved");
  assert.equal(updated.status, "approved");
  assert.ok(updated.decidedAt);
});

test("sin storage disponible (Node sin localStorage inyectado): no truena, devuelve defaults", () => {
  const store = createStore(null);
  assert.equal(store.loadWizardData(), null);
  assert.deepEqual(store.loadRuns(), []);
  store.saveWizardData({ x: 1 }); // no debe lanzar
});
