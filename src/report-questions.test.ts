import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Questions } from "./contract.js";
import { jevQuestions, parseReportCatalog, publicQuestionUi } from "./report-catalog.js";

const raw = JSON.parse(readFileSync(new URL("../data/report-questions.v3.json", import.meta.url), "utf8")) as unknown;
const catalog = parseReportCatalog(raw);
const questions: Questions = jevQuestions(catalog);

test("V3 keeps return bands separate from abstention states", () => {
  for (const [id, expectedCount] of [["return_band_7d", 5], ["return_band_30d", 5]] as const) {
    const question = questions[id];
    assert.equal(question?.type, "choice");
    if (question?.type !== "choice") continue;
    assert.equal(Object.keys(question.criteria).length, expectedCount);
    assert.equal(Object.keys(question.criteria).some((key) => key.startsWith("abstain_")), false);
  }
});

test("V3 includes evidence and risk questions", () => {
  for (const id of ["token_value_capture", "supply_unlock_evidence", "protocol_activity_trend", "valuation_evidence", "material_risk_evidence", "project_background", "web3_position", "ecosystem_adoption", "future_development", "competitive_position", "catalyst_outlook", "risk_severity", "research_priority", "market_context", "short_term_direction_7d", "short_term_direction_30d"]) {
    assert.equal(questions[id]?.type, "choice");
  }
  assert.equal(Object.keys(questions).length, 18);
});

test("V3 treats a trusted report gap as not-covered, not source distrust", () => {
  for (const id of ["token_value_capture", "supply_unlock_evidence", "protocol_activity_trend", "valuation_evidence", "material_risk_evidence"]) {
    const question = questions[id];
    assert.equal(question?.type, "choice");
    if (question?.type !== "choice") continue;
    assert.equal(Object.hasOwn(question.criteria, "not_covered"), true);
    assert.equal(Object.hasOwn(question.criteria, "insufficient_evidence"), false);
  }
});

test("every report option has a Chinese label and Jev receives only its question contract", () => {
  const ui = publicQuestionUi(catalog);
  assert.deepEqual(Object.keys(ui), Object.keys(questions));
  for (const [id, question] of Object.entries(questions)) {
    assert.equal(question.type, "choice");
    if (question.type !== "choice") continue;
    assert.deepEqual(Object.keys(ui[id].labels), Object.keys(question.criteria));
    assert.equal(Object.hasOwn(question, "ui"), false);
    assert.equal(Object.hasOwn(question, "research_points"), false);
    assert.ok(["base", "7d", "30d"].includes(ui[id].scope));
  }
  assert.equal(ui.short_term_direction_7d.scope, "7d");
  assert.equal(ui.return_band_30d.scope, "30d");
});

test("catalog rejects missing labels and incomplete scoring maps", () => {
  const missingLabel = structuredClone(raw) as Record<string, any>;
  delete missingLabel.project_background.ui.labels.web3_core_infrastructure;
  assert.throws(() => parseReportCatalog(missingLabel), /页面标签/);
  const missingScore = structuredClone(raw) as Record<string, any>;
  delete missingScore.project_background.research_points.web3_core_infrastructure;
  assert.throws(() => parseReportCatalog(missingScore), /评分映射/);
});
