import type { Question, Questions } from "./contract.js";

export type ReportScope = "base" | "7d" | "30d";
export type ReportGroup = "证据分类" | "项目分析" | "研究判断" | "风险状态" | "条件预测";

export type ReportQuestionUi = {
  title: string;
  description: string;
  group: ReportGroup;
  scope: ReportScope;
  labels: Record<string, string>;
};

export type ReportQuestion = {
  question: Extract<Question, { type: "choice" }>;
  ui: ReportQuestionUi;
  research_points?: Record<string, number>;
  missing_option?: string;
};

export type ReportCatalog = Record<string, ReportQuestion>;

export function parseReportCatalog(value: unknown): ReportCatalog {
  if (!isRecord(value) || Object.keys(value).length < 1 || Object.keys(value).length > 20) {
    throw new Error("报告判断问题配置无效");
  }
  const catalog: ReportCatalog = {};
  let totalMaxPoints = 0;
  for (const [id, raw] of Object.entries(value)) {
    if (!id || id.length > 60 || !isRecord(raw) || raw.type !== "choice" || !nonEmpty(raw.instructions) || !isRecord(raw.criteria)) {
      throw new Error(`问题 ${id} 的定义无效`);
    }
    const criteria = raw.criteria;
    const keys = Object.keys(criteria);
    if (keys.length < 2 || keys.length > 50 || Object.values(criteria).some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`问题 ${id} 的选项标准无效`);
    }
    if (!isRecord(raw.ui) || !nonEmpty(raw.ui.title) || !nonEmpty(raw.ui.description) ||
      !["证据分类", "项目分析", "研究判断", "风险状态", "条件预测"].includes(String(raw.ui.group)) ||
      !["base", "7d", "30d"].includes(String(raw.ui.scope)) || !isRecord(raw.ui.labels) ||
      !sameKeys(raw.ui.labels, keys) || Object.values(raw.ui.labels).some((label) => !nonEmpty(label))) {
      throw new Error(`问题 ${id} 的页面标签或门禁范围无效`);
    }
    let researchPoints: Record<string, number> | undefined;
    let missingOption: string | undefined;
    if (raw.research_points !== undefined) {
      if (!isRecord(raw.research_points) || !sameKeys(raw.research_points, keys) ||
        Object.values(raw.research_points).some((point) => typeof point !== "number" || !Number.isFinite(point) || point < 0) ||
        typeof raw.missing_option !== "string" || !Object.hasOwn(raw.research_points, raw.missing_option) ||
        raw.research_points[raw.missing_option] !== 0) {
        throw new Error(`问题 ${id} 的研究评分映射无效`);
      }
      researchPoints = raw.research_points as Record<string, number>;
      missingOption = raw.missing_option;
      totalMaxPoints += Math.max(...Object.values(researchPoints));
    } else if (raw.missing_option !== undefined) {
      throw new Error(`问题 ${id} 的缺失选项没有对应评分`);
    }
    catalog[id] = {
      question: { type: "choice", instructions: raw.instructions, criteria: criteria as Record<string, string> },
      ui: raw.ui as ReportQuestionUi,
      ...(researchPoints ? { research_points: researchPoints, missing_option: missingOption } : {}),
    };
  }
  if (totalMaxPoints !== 100) throw new Error(`研究评分满分应为 100，当前为 ${totalMaxPoints}`);
  return catalog;
}

export function jevQuestions(catalog: ReportCatalog, ids: string[] = Object.keys(catalog)): Questions {
  return Object.fromEntries(ids.map((id) => [id, catalog[id].question]));
}

export function publicQuestionUi(catalog: ReportCatalog): Record<string, ReportQuestionUi> {
  return Object.fromEntries(Object.entries(catalog).map(([id, entry]) => [id, entry.ui]));
}

function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
