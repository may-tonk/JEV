import type { DecisionResponse, Questions } from "./contract.js";
import { parseDecisionResponse } from "./contract.js";

const OFFICIAL_URL = "https://api.typesafe.ai/v1/systemone";

export type JevClient = {
  model: string;
  evaluate(state: unknown, questions: Questions): Promise<DecisionResponse>;
};

export function createJevClient(): JevClient {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("请先设置 TYPESAFE_API_KEY，再运行官方 Jev 测试");
  const model = process.env.TYPESAFE_MODEL || "jev-latest";
  return {
    model,
    evaluate: async (state, questions) => {
      const response = await fetch(OFFICIAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, state, questions }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      return parseDecisionResponse(await response.json(), questions);
    },
  };
}
