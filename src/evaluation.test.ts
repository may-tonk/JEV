import assert from "node:assert/strict";
import test from "node:test";
import { brierScore, coverage, logLoss, top1Accuracy } from "./evaluation.js";

const predictions = [
  { eligible: true, actualClass: "up", probabilities: { up: 0.8, flat: 0.2 } },
  { eligible: true, actualClass: "flat", probabilities: { up: 0.25, flat: 0.75 } },
  { eligible: false, probabilities: { up: 1, flat: 0 } },
];

test("evaluation metrics exclude ineligible cases", () => {
  assert.equal(coverage(predictions), 1);
  assert.equal(top1Accuracy(predictions), 1);
  assert.equal(brierScore(predictions), 0.1025);
  assert.ok(logLoss(predictions) > 0);
});
