import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { Questions } from "./contract.js";
import { createJevClient } from "./jev-client.js";

type SnapshotDraft = { state: Record<string, unknown> };
type QuestionsDraft = { proposed_questions: Questions };

async function main(): Promise<void> {
  const snapshot = JSON.parse(await readFile(resolve("data/uni-jev-state.draft.json"), "utf8")) as SnapshotDraft;
  const questionDraft = JSON.parse(await readFile(resolve("data/uni-questions.draft.json"), "utf8")) as QuestionsDraft;
  if (!snapshot.state || !questionDraft.proposed_questions) throw new Error("UNI 草稿缺少 state 或问题");

  const client = createJevClient();
  const requestedAt = new Date().toISOString();
  const start = performance.now();
  const response = await client.evaluate(snapshot.state, questionDraft.proposed_questions);
  const result = {
    test_type: "uni_v1_exploratory",
    requested_at: requestedAt,
    latency_ms: Math.round(performance.now() - start),
    model: response.model,
    request: {
      state: snapshot.state,
      questions: questionDraft.proposed_questions,
    },
    response,
    interpretation_note: "这是单个 UNI 报告快照的探索性输出，不是投资建议，也不能代表模型准确率。",
  };
  await mkdir(resolve("results"), { recursive: true });
  const filename = resolve("results", `official-uni-${requestedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(filename, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ test_type: result.test_type, model: result.model, latency_ms: result.latency_ms, answers: response.answers, file: filename }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
