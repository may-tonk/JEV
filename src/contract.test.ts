import assert from "node:assert/strict";
import test from "node:test";
import { parseDecisionResponse, type Questions } from "./contract.js";

const questions: Questions = {
  department: {
    type: "choice",
    instructions: "Which team?",
    criteria: { billing: null, technical: null },
  },
  urgent: { type: "noul", instructions: "Is this urgent?" },
  severity: { type: "score", instructions: "How severe?", criteria: ["Low", "High"] },
};

test("official HTTP response shape is accepted for all three question types", () => {
  const response = parseDecisionResponse({
    model: "jev-latest",
    answers: {
      department: {
        type: "choice", choice: "billing", probabilities: { billing: 0.8, technical: 0.2 }, confidence: 0.6,
      },
      urgent: { type: "noul", noul: 0.92 },
      severity: {
        type: "score", score: 0.75, probabilities: { "0": 0.25, "1": 0.75 },
        legend: { "0": "Low", "1": "High" }, confidence: 0.5,
      },
    },
    usage: { input_tokens: 312, output_tokens: 48 },
  }, questions);

  assert.equal(response.model, "jev-latest");
  assert.equal(response.answers.department.type, "choice");
  assert.equal(response.answers.urgent.type, "noul");
  assert.equal(response.answers.severity.type, "score");
  assert.equal(response.usage?.input_tokens, 312);
});

test("probability maps must match question options and be bounded", () => {
  assert.throws(() => parseDecisionResponse({
    model: "jev-latest",
    answers: {
      department: { type: "choice", choice: "unknown", probabilities: { billing: 0.8, technical: 0.2 }, confidence: 0.6 },
      urgent: { type: "noul", noul: 0.92 },
      severity: { type: "score", score: 0.75, probabilities: { "0": 0.25, "1": 0.75 }, legend: { "0": "Low", "1": "High" }, confidence: 0.5 },
    },
  }, questions));
  assert.throws(() => parseDecisionResponse({
    model: "jev-latest",
    answers: {
      department: { type: "choice", choice: "billing", probabilities: { billing: 1.2, technical: -0.2 }, confidence: 0.6 },
      urgent: { type: "noul", noul: 0.92 },
      severity: { type: "score", score: 0.75, probabilities: { "0": 0.25, "1": 0.75 }, legend: { "0": "Low", "1": "High" }, confidence: 0.5 },
    },
  }, questions));
});

test("chosen option must have the highest relative weight, ties are allowed", () => {
  const answer = { type: "choice", choice: "billing", probabilities: { billing: 0.4, technical: 0.6 }, confidence: 0.6 };
  const response = { model: "jev-latest", answers: { department: answer, urgent: { type: "noul", noul: 0.92 }, severity: { type: "score", score: 0.75, probabilities: { "0": 0.25, "1": 0.75 }, legend: { "0": "Low", "1": "High" }, confidence: 0.5 } } };
  assert.throws(() => parseDecisionResponse(response, questions), /主选项不是相对权重最高/);
  answer.probabilities = { billing: 0.5, technical: 0.5 };
  assert.equal(parseDecisionResponse(response, questions).answers.department.type, "choice");
});
