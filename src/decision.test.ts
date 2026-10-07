import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Answer } from "./contract.js";
import { deriveResearchDecision } from "./decision.js";
import { parseReportCatalog } from "./report-catalog.js";

const catalog = parseReportCatalog(JSON.parse(readFileSync(new URL("../data/report-questions.v3.json", import.meta.url), "utf8")) as unknown);

function strongAnswers(): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const [id, entry] of Object.entries(catalog)) {
    if (!entry.research_points) continue;
    const best = Object.entries(entry.research_points).sort((a, b) => b[1] - a[1])[0][0];
    answers[id] = { type: "choice", choice: best, probabilities: Object.fromEntries(Object.keys(entry.research_points).map((option) => [option, option === best ? 1 : 0])), confidence: 0.9 };
  }
  answers.supply_unlock_evidence = { type: "choice", choice: "no_scheduled_release_documented", probabilities: { no_scheduled_release_documented: 1 }, confidence: 0.9 };
  answers.valuation_evidence = { type: "choice", choice: "token_level_comparable", probabilities: { token_level_comparable: 1 }, confidence: 0.9 };
  answers.material_risk_evidence = { type: "choice", choice: "no_material_risk_documented", probabilities: { no_material_risk_documented: 1 }, confidence: 0.9 };
  answers.risk_severity = { type: "choice", choice: "low", probabilities: { low: 1 }, confidence: 0.9 };
  answers.research_priority = { type: "choice", choice: "deep_research", probabilities: { deep_research: 1 }, confidence: 0.9 };
  return answers;
}

test("research score uses all option weights and measures weighted coverage", () => {
  const answers = strongAnswers();
  const full = deriveResearchDecision(answers, catalog);
  assert.equal(full.research_score, 100);
  assert.equal(full.research_coverage, 100);
  const future = answers.future_development;
  assert.equal(future.type, "choice");
  if (future.type !== "choice") return;
  future.probabilities.high_potential = 0.5;
  future.probabilities.development_not_covered = 0.5;
  const uncertain = deriveResearchDecision(answers, catalog);
  assert.equal(uncertain.research_score, 90);
  assert.equal(uncertain.research_coverage, 90);
  assert.equal(uncertain.score_breakdown.future_development, 10);
});

test("a blocking risk overrides research priority and zeroes the research score", () => {
  const answers = strongAnswers();
  answers.risk_severity = { type: "choice", choice: "blocking_risk", probabilities: { blocking_risk: 1 }, confidence: 0.9 };
  const decision = deriveResearchDecision(answers, catalog);
  assert.equal(decision.now.decision, "do_not_enter_now");
  assert.equal(decision.horizon_9m.decision, "do_not_enter_now");
  assert.equal(decision.horizon_18m.decision, "do_not_enter_now");
  assert.equal(decision.research_score, 0);
  assert.equal(decision.score_breakdown.risk_adjustment, -100);
});

test("missing core evidence overrides an optimistic research priority", () => {
  const answers = strongAnswers();
  for (const [id, option] of [["token_value_capture", "not_covered"], ["supply_unlock_evidence", "not_covered"]] as const) {
    answers[id] = { type: "choice", choice: option, probabilities: { [option]: 1 }, confidence: 0.9 };
  }
  const decision = deriveResearchDecision(answers, catalog);
  assert.equal(decision.policy_version, "research-policy-v3");
  assert.equal(decision.now.decision, "insufficient_evidence");
});

test("monitor-only research priority stays distinct from watchlist", () => {
  const answers = strongAnswers();
  answers.research_priority = { type: "choice", choice: "monitor_only", probabilities: { monitor_only: 1 }, confidence: 0.9 };
  answers.material_risk_evidence = { type: "choice", choice: "verified_material_risk", probabilities: { verified_material_risk: 1 }, confidence: 0.9 };
  const decision = deriveResearchDecision(answers, catalog);
  assert.equal(decision.now.decision, "monitor_only");
});

test("material risk does not upgrade a do-not-prioritize assessment", () => {
  const answers = strongAnswers();
  answers.research_priority = { type: "choice", choice: "do_not_prioritize", probabilities: { do_not_prioritize: 1 }, confidence: 0.9 };
  answers.material_risk_evidence = { type: "choice", choice: "verified_material_risk", probabilities: { verified_material_risk: 1 }, confidence: 0.9 };
  assert.equal(deriveResearchDecision(answers, catalog).now.decision, "do_not_prioritize");
});
