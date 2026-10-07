import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { Question, Questions } from "./contract.js";
import { createJevClient } from "./jev-client.js";
import { deriveResearchDecision } from "./decision.js";
import { jevQuestions, parseReportCatalog, publicQuestionUi, type ReportCatalog } from "./report-catalog.js";
import { prepareReportState, validateReportState, type GateResult } from "./report-schema.js";
import { APP_BUILD_ID } from "./version.js";

const host = "127.0.0.1";
const port = Number(process.env.JEV_PORT || 4173);
const staticFiles: Record<string, { file: string; type: string }> = {
  "/": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/style.css": { file: "public/style.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "public/app.js", type: "text/javascript; charset=utf-8" },
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/api/config") {
      return sendJson(response, 200, { officialAvailable: Boolean(process.env.TYPESAFE_API_KEY), questionSetVersion: "report-v3", inputSchemaVersion: "report-v3", buildId: APP_BUILD_ID });
    }
    if (request.method === "GET" && url.pathname === "/api/report-questions") {
      const catalog = await loadReportCatalog();
      return sendJson(response, 200, { questions: jevQuestions(catalog), ui: publicQuestionUi(catalog) });
    }
    if (request.method === "GET" && url.pathname === "/api/report-results") {
      const names = (await readdir(resolve("results"), { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isFile() && entry.name.startsWith("official-report-") && entry.name.endsWith(".json"))
        .map((entry) => entry.name).sort().reverse();
      const results = await Promise.all(names.map(async (name) => {
        const value = JSON.parse(await readFile(resolve("results", name), "utf8")) as Record<string, unknown>;
        if (value.question_set_version !== "report-v3") return null;
        return { file: name, requested_at: value.requested_at, model: value.model, latency_ms: value.latency_ms,
          answers: isRecord(value.response) ? value.response.answers : undefined,
          question_ids: isRecord(value.request) && Array.isArray(value.request.selected_question_ids)
            ? value.request.selected_question_ids
            : isRecord(value.request) && isRecord(value.request.questions) ? Object.keys(value.request.questions) : [],
          gate: value.gate,
          derived_decision: value.derived_decision,
          skipped_questions: value.skipped_questions };
      }));
      return sendJson(response, 200, { results: results.filter((item) => item !== null).slice(0, 20) });
    }
    if (request.method === "GET" && url.pathname === "/api/uni-draft") {
      const snapshot: unknown = JSON.parse(await readFile(resolve("data/uni-jev-state.draft.json"), "utf8"));
      const questions = await loadUniQuestions();
      if (!isRecord(snapshot) || !isRecord(snapshot.state) || !questions) {
        return sendJson(response, 500, { error: "UNI 草稿数据或问题格式不正确" });
      }
      return sendJson(response, 200, {
        state: snapshot.state,
        questions,
        model: process.env.TYPESAFE_MODEL || "jev-latest",
        status: "preview_only",
        note: "问题规则为 UNI V1；你可以修改报告 state，发送时使用同一套固定问题。",
      });
    }
    if (request.method === "GET" && url.pathname === "/api/uni-results") {
      const names = (await readdir(resolve("results"), { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isFile() && entry.name.startsWith("official-uni-") && entry.name.endsWith(".json"))
        .map((entry) => entry.name)
        .sort()
        .reverse()
        .slice(0, 20);
      const results = await Promise.all(names.map(async (name) => {
        const value = JSON.parse(await readFile(resolve("results", name), "utf8")) as Record<string, unknown>;
        const responseValue = isRecord(value.response) ? value.response : {};
        return {
          file: name,
          requested_at: value.requested_at,
          model: value.model,
          latency_ms: value.latency_ms,
          answers: responseValue.answers,
          validation: value.validation,
        };
      }));
      return sendJson(response, 200, { results });
    }
    if (request.method === "POST" && url.pathname === "/api/uni-validate") {
      const body = JSON.parse(await readBody(request)) as unknown;
      if (!isRecord(body) || typeof body.file !== "string" || !/^[A-Za-z0-9_.-]+\.json$/.test(body.file)) {
        return sendJson(response, 400, { error: "结果文件名不正确" });
      }
      const actual7d = optionalFiniteNumber(body.actual_return_7d);
      const actual30d = optionalFiniteNumber(body.actual_return_30d);
      if (actual7d === undefined && actual30d === undefined) return sendJson(response, 400, { error: "至少填写一个实际收益率" });
      const file = resolve("results", body.file);
      const saved: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!isRecord(saved) || !isRecord(saved.response) || !isRecord(saved.response.answers)) return sendJson(response, 400, { error: "结果文件格式不正确" });
      const answers = saved.response.answers;
      const validation = isRecord(saved.validation) ? { ...saved.validation } : {};
      const outcomes = isRecord(validation.outcomes) ? { ...validation.outcomes } : {};
      if (actual7d !== undefined) {
        const predicted = getChoice(answers, "return_band_7d");
        const actual = bandFor7d(actual7d);
        outcomes.return_band_7d = { actual_return_pct: actual7d, actual_band: actual, predicted_band: predicted, correct: predicted === actual };
        validation.actual_return_7d = actual7d;
      }
      if (actual30d !== undefined) {
        const predicted = getChoice(answers, "return_band_30d");
        const actual = bandFor30d(actual30d);
        outcomes.return_band_30d = { actual_return_pct: actual30d, actual_band: actual, predicted_band: predicted, correct: predicted === actual };
        validation.actual_return_30d = actual30d;
      }
      validation.validated_at = new Date().toISOString();
      validation.outcomes = outcomes;
      saved.validation = validation;
      await writeFile(file, JSON.stringify(saved, null, 2), "utf8");
      return sendJson(response, 200, { file: body.file, validation });
    }
    if (request.method === "POST" && url.pathname === "/api/evaluate") {
      const body = JSON.parse(await readBody(request)) as unknown;
      if (!isRecord(body)) return sendJson(response, 400, { error: "请求内容必须是 JSON 对象" });
      const { provider, scenario } = body;
      let state = body.state;
      if (scenario !== "uni_v1" && scenario !== "report") return sendJson(response, 400, { error: "请选择有效的判断方式" });
      if (provider !== undefined && provider !== "official") return sendJson(response, 400, { error: "此项目只支持 TypeSafe 官方 Jev API" });
      if (!process.env.TYPESAFE_API_KEY) return sendJson(response, 400, { error: "尚未配置 TypeSafe API Key" });
      if (!isState(state)) return sendJson(response, 400, { error: "请输入报告原文、JSON 对象或 JSON 数组" });
      const requestedAt = new Date().toISOString();
      if (scenario === "report") state = prepareReportState(state, requestedAt);
      const serializedState = JSON.stringify(state);
      if (serializedState.length > 100000) return sendJson(response, 400, { error: "报告内容超过本机 100000 字符上限" });
      let questions: Questions | null;
      let reportCatalog: ReportCatalog | undefined;
      let gate: GateResult | undefined;
      let skippedQuestions: Array<{ id: string; scope: string; reasons: string[] }> = [];
      if (scenario === "report") {
        reportCatalog = await loadReportCatalog();
        const available = jevQuestions(reportCatalog);
        const ids = body.question_ids;
        if (!Array.isArray(ids) || ids.length < 1) {
          return sendJson(response, 400, { error: "请至少选择一个有效的判断问题" });
        }
        if (ids.length > Object.keys(available).length) {
          return sendJson(response, 400, { error: `最多可选择 ${Object.keys(available).length} 道判断问题；若页面显示不同数量，请重启本机服务并刷新页面。` });
        }
        if (ids.some((id) => typeof id !== "string" || !Object.hasOwn(available, id)) || new Set(ids).size !== ids.length) {
          return sendJson(response, 400, { error: "题目配置与页面不一致，请重启本机服务并刷新页面。" });
        }
        const baseGate = validateReportState(state, { scope: "base" });
        if (baseGate.status !== "pass") return sendJson(response, 422, { error: "报告缺少基础信息，无法进行研究判断。", gate: baseGate });
        const eligible: string[] = [];
        const allChecks = [...baseGate.checks];
        for (const id of ids as string[]) {
          const scope = reportCatalog[id].ui.scope;
          const scopedGate = scope === "base" ? baseGate : validateReportState(state, { scope, now: new Date() });
          if (scope !== "base") allChecks.push(...scopedGate.checks.map((check) => ({ ...check, id: `${scope}.${id}.${check.id}` })));
          if (scopedGate.status === "pass") eligible.push(id);
          else skippedQuestions.push({ id, scope, reasons: scopedGate.checks.filter((check) => !check.passed).map((check) => check.message) });
        }
        questions = Object.fromEntries(eligible.map((id) => [id, available[id]]));
        gate = {
          status: eligible.length === ids.length ? "pass" : eligible.length > 0 ? "partial" : "not_evaluable",
          checks: allChecks,
        };
        if (!eligible.length) return sendJson(response, 200, {
          provider: "official", scenario, latency_ms: 0, model: process.env.TYPESAFE_MODEL || "jev-latest", answers: {},
          skipped_questions: skippedQuestions, gate, interpretation_note: "基础报告已接收，但当前选择的问题均缺少对应数据；未调用 Jev 生成不可评估的答案。",
        });
      } else {
        questions = await loadUniQuestions();
      }
      if (!questions) return sendJson(response, 500, { error: "问题配置无效" });
      const start = performance.now();
      const client = createJevClient();
      const result = await client.evaluate(state, questions);
      const latency = Math.round(performance.now() - start);
      const derivedDecision = scenario === "report" && gate && reportCatalog ? deriveResearchDecision(result.answers, reportCatalog) : undefined;
      const saved = {
        test_type: scenario === "report" ? "report_exploratory" : "uni_v1_exploratory",
        ...(scenario === "report" ? { question_set_version: "report-v3", input_schema_version: "report-v3", gate, derived_decision: derivedDecision } : {}),
        requested_at: requestedAt,
        latency_ms: latency,
        model: result.model,
        request: { state, selected_question_ids: scenario === "report" ? body.question_ids : undefined, questions },
        response: result,
        ...(scenario === "report" ? { skipped_questions: skippedQuestions } : {}),
        interpretation_note: "这是 report-v3 的单份报告探索性判断。Hermes 报告按已验证来源处理；各选项权重仅作为相对评分用于启发式研究评分，并非校准后的投资概率。研究行动由 research-policy-v3 根据证据完整性、主选项和风险护栏生成；9/18 个月共用长期研究条件，不代表独立的收益预测。",
      };
      await mkdir(resolve("results"), { recursive: true });
      const filename = `${scenario === "report" ? "official-report" : "official-uni"}-${requestedAt.replace(/[:.]/g, "-")}.json`;
      await writeFile(resolve("results", filename), JSON.stringify(saved, null, 2), "utf8");
      return sendJson(response, 200, { ...result, provider: "official", scenario, latency_ms: latency, saved_file: `results/${filename}`, gate, derived_decision: derivedDecision, skipped_questions: skippedQuestions });
    }
    const staticFile = request.method === "GET" ? staticFiles[url.pathname] : undefined;
    if (staticFile) {
      const content = await readFile(resolve(staticFile.file));
      response.writeHead(200, { "Content-Type": staticFile.type, "Cache-Control": "no-store" });
      return response.end(content);
    }
    return sendJson(response, 404, { error: "页面不存在" });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 502;
    return sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, host, () => console.log(`JEV 页面已启动：http://${host}:${port}`));

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 250000) throw new Error("请求内容过长");
  }
  return body;
}

async function loadUniQuestions(): Promise<Questions | null> {
  const draft: unknown = JSON.parse(await readFile(resolve("data/uni-questions.draft.json"), "utf8"));
  if (!isRecord(draft) || !validQuestions(draft.proposed_questions)) return null;
  return draft.proposed_questions;
}

async function loadReportCatalog(): Promise<ReportCatalog> {
  const value: unknown = JSON.parse(await readFile(resolve("data/report-questions.v3.json"), "utf8"));
  return parseReportCatalog(value);
}

function isState(value: unknown): value is string | Record<string, unknown> | unknown[] {
  if (typeof value === "string") return value.trim().length > 0;
  return isRecord(value) || Array.isArray(value);
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getChoice(answers: Record<string, unknown>, id: string): string | null {
  const answer = answers[id];
  return isRecord(answer) && typeof answer.choice === "string" ? answer.choice : null;
}

function bandFor7d(value: number): string {
  if (value <= -10) return "fall_gt_10";
  if (value <= -3) return "fall_3_to_10";
  if (value <= 3) return "range_minus3_plus3";
  if (value <= 10) return "rise_3_to_10";
  return "rise_gt_10";
}

function bandFor30d(value: number): string {
  if (value <= -20) return "fall_gt_20";
  if (value <= -5) return "fall_5_to_20";
  if (value <= 5) return "range_minus5_plus5";
  if (value <= 20) return "rise_5_to_20";
  return "rise_gt_20";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validQuestions(value: unknown): value is Questions {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 20) return false;
  return entries.every(([id, raw]) => id.length > 0 && id.length <= 60 && validQuestion(raw));
}

function validQuestion(value: unknown): value is Question {
  if (!isRecord(value) || typeof value.instructions !== "string" || !value.instructions.trim()) return false;
  if (value.type === "noul") return value.criteria === undefined || isRecord(value.criteria);
  if (value.type === "score") return Array.isArray(value.criteria) && value.criteria.length >= 2 && value.criteria.length <= 50 && value.criteria.every((item) => typeof item === "string");
  if (value.type === "choice") return isRecord(value.criteria) && Object.keys(value.criteria).length >= 2 && Object.keys(value.criteria).length <= 50 && Object.values(value.criteria).every((item) => item === null || typeof item === "string");
  return false;
}
