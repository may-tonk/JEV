export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } };

export type Questions = Record<string, Question>;

export type Case = {
  id: string;
  state: string | Record<string, unknown> | unknown[];
  expected: { department: string; urgent: boolean };
};

export type Answer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number; legend: Record<string, string> }
  | { type: "noul"; noul: number };

export type DecisionResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function parseDecisionResponse(value: unknown, questions: Questions): DecisionResponse {
  if (!isRecord(value) || !isRecord(value.answers) || typeof value.model !== "string") {
    throw new Error("接口响应缺少 model 或 answers");
  }
  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const answer = value.answers[id];
    if (!isRecord(answer) || answer.type !== question.type) {
      throw new Error(`问题 ${id} 的响应类型不正确`);
    }
    if (answer.type === "choice") {
      if (question.type !== "choice" || typeof answer.choice !== "string" || !isBoundedProbability(answer.confidence) || !isChoiceProbabilityMap(answer.probabilities, Object.keys(question.criteria))) {
        throw new Error(`问题 ${id} 的 Choice 响应不完整`);
      }
      if (!Object.hasOwn(question.criteria, answer.choice)) throw new Error(`问题 ${id} 返回了不存在的选项 ${answer.choice}`);
      if (answer.probabilities[answer.choice] < Math.max(...Object.values(answer.probabilities)) - 1e-9) {
        throw new Error(`问题 ${id} 的主选项不是相对权重最高的选项`);
      }
      answers[id] = { type: "choice", choice: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities };
    } else if (answer.type === "score") {
      if (question.type !== "score" || !isNumber(answer.score) || !isBoundedProbability(answer.confidence) || !isChoiceProbabilityMap(answer.probabilities, question.criteria.map((_, index) => String(index))) || !isStringMap(answer.legend)) {
        throw new Error(`问题 ${id} 的 Score 响应不完整`);
      }
      answers[id] = { type: "score", score: answer.score, confidence: answer.confidence, probabilities: answer.probabilities, legend: answer.legend };
    } else if (answer.type === "noul") {
      if (!isNumber(answer.noul)) throw new Error(`问题 ${id} 的 Noul 响应不完整`);
      answers[id] = { type: "noul", noul: answer.noul };
    }
  }
  const usage = isRecord(value.usage) ? {
    input_tokens: isNumber(value.usage.input_tokens) ? value.usage.input_tokens : undefined,
    output_tokens: isNumber(value.usage.output_tokens) ? value.usage.output_tokens : undefined,
  } : undefined;
  return { model: value.model, answers, usage };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isChoiceProbabilityMap(value: unknown, expectedKeys: string[]): value is Record<string, number> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== [...expectedKeys].sort()[index])) return false;
  const values = Object.values(value);
  if (!values.every(isBoundedProbability)) return false;
  const sum = values.reduce((total, item) => total + item, 0);
  return Math.abs(sum - 1) <= 0.02;
}
function isBoundedProbability(value: unknown): value is number { return isNumber(value) && value >= 0 && value <= 1; }
function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
