import { randomUUID } from "node:crypto";

export type EvidenceStatus = "verified" | "partially_verified" | "unverified" | "inference" | "contradictory" | "missing";
export type EvidenceKind = "fact" | "inference" | "calculation";

export type ReportEvidence = {
  evidence_id: string;
  dimension: string;
  claim: string;
  value?: unknown;
  observed_at_utc?: string;
  source?: string;
  status: EvidenceStatus;
  kind: EvidenceKind;
};

export type ReportProvenance = {
  provider: "Hermes";
  verification_status: "verified";
  trust_mode: "accept_explicit_claims";
};

export type HistoricalPoint = { timestamp_utc: string; close_usd: number };

export type ReportState = {
  schema_version: "report-v3";
  case_id?: string;
  asset?: {
    name?: string;
    symbol?: string;
    chain?: string;
    contract?: string;
    asset_id?: string;
  };
  snapshot?: {
    t0_utc?: string;
    report_cutoff_utc?: string;
    requested_at_utc?: string;
  };
  market?: {
    spot_usd?: number;
    spot_source?: string;
    spot_observed_at_utc?: string;
    liquidity_usd?: number;
    volume_24h_usd?: number;
    return_7d_pct?: number;
    return_30d_pct?: number;
    return_1y_pct?: number;
    historical_hourly?: HistoricalPoint[];
  };
  raw_report: string;
  provenance?: ReportProvenance;
  evidence?: ReportEvidence[];
};

export type GateCheck = {
  id: string;
  passed: boolean;
  message: string;
};

export type GateResult = {
  status: "pass" | "partial" | "not_evaluable";
  checks: GateCheck[];
};

export type GateScope = "base" | "7d" | "30d";

export function isReportState(value: unknown): value is ReportState {
  return validateReportState(value, { requireShortTerm: false }).status === "pass";
}

export function prepareReportState(value: unknown, requestedAtUtc: string): unknown {
  if (!isRecord(value)) return value;
  const snapshot = isRecord(value.snapshot) ? value.snapshot : {};
  return {
    ...value,
    case_id: nonEmptyString(value.case_id) ? value.case_id : `report-${randomUUID()}`,
    snapshot: { ...snapshot, requested_at_utc: requestedAtUtc },
  };
}

export function validateReportState(
  value: unknown,
  options: { requireShortTerm?: boolean; scope?: GateScope; now?: Date },
): GateResult {
  const checks: GateCheck[] = [];
  const add = (id: string, passed: boolean, message: string) => checks.push({ id, passed, message });
  const state = isRecord(value) ? value : null;
  if (!state) {
    add("state_object", false, "报告输入必须是 report-v3 结构化对象。");
    return { status: "not_evaluable", checks };
  }

  add("schema_version", state.schema_version === "report-v3", "输入版本必须为 report-v3。");
  add("raw_report", nonEmptyString(state.raw_report), "必须保留完整报告原文。");
  const scope = options.scope ?? (options.requireShortTerm ? "30d" : "base");
  if (scope === "base") return { status: checks.every((check) => check.passed) ? "pass" : "not_evaluable", checks };

  add("case_id", nonEmptyString(state.case_id), "短期判断需要案例 ID；服务端会自动生成。");
  const asset = isRecord(state.asset) ? state.asset : null;
  add("asset_identity", Boolean(asset && nonEmptyString(asset.name) && nonEmptyString(asset.symbol) && nonEmptyString(asset.chain) && (nonEmptyString(asset.contract) || nonEmptyString(asset.asset_id))), "必须提供名称、符号、链以及合约地址或稳定资产 ID。");
  const snapshot = isRecord(state.snapshot) ? state.snapshot : null;
  const t0 = snapshot ? parseUtc(snapshot.t0_utc) : null;
  const cutoff = snapshot ? parseUtc(snapshot.report_cutoff_utc) : null;
  add("snapshot_time", Boolean(t0), "t0_utc 必须是有效 UTC 时间。");
  add("report_cutoff", Boolean(cutoff), "report_cutoff_utc 必须是有效 UTC 时间。");
  if (t0 && cutoff) add("cutoff_not_after_t0", cutoff.getTime() <= t0.getTime(), "报告截止时间不能晚于 t0。");
  const market = isRecord(state.market) ? state.market : null;
  add("spot_price", Boolean(market && finiteNonNegative(market.spot_usd) && market.spot_usd > 0), "短期判断需要正的 spot_usd。");
  add("spot_source", Boolean(market && nonEmptyString(market.spot_source)), "短期判断必须提供价格来源。");
  const spotObserved = market ? parseUtc(market.spot_observed_at_utc) : null;
  add("spot_observed_at", Boolean(spotObserved), "短期判断需要有效的 spot_observed_at_utc。");
  add("spot_matches_t0", Boolean(t0 && spotObserved && Math.abs(spotObserved.getTime() - t0.getTime()) <= 5 * 60 * 1000), "起点价格与 t0 的距离必须不超过 5 分钟。");
  const now = options.now ?? new Date();
  add("t0_not_future", Boolean(t0 && t0.getTime() <= now.getTime()), "t0 不能晚于请求时间。");
  if (t0 && cutoff) {
    const ageHours = (t0.getTime() - cutoff.getTime()) / 3600000;
    add("report_freshness", ageHours >= 0 && ageHours <= 24, "短期预测要求报告截止时间距离 t0 不超过 24 小时。");
  } else {
    add("report_freshness", false, "无法验证报告新鲜度。");
  }
  add("liquidity", Boolean(market && finiteNonNegative(market.liquidity_usd)), "短期判断必须提供流动性。");
  add("volume_24h", Boolean(market && finiteNonNegative(market.volume_24h_usd)), "短期判断必须提供 24 小时成交量。");
  const history = market?.historical_hourly;
  const requiredPoints = scope === "7d" ? 152 : 648;
  const historyWindow = scope === "7d" ? "最近 7 天" : "最近 30 天";
  add("historical_hourly", validHourlyHistory(history, t0, scope, requiredPoints), `${scope} 判断需要至少 ${requiredPoints} 个不重复的有效小时价格点，覆盖${historyWindow}；不得包含 t0 之后的数据，且首尾与中间不能有大段缺口。`);

  return { status: checks.every((check) => check.passed) ? "pass" : "not_evaluable", checks };
}

function isHistoricalPoint(value: unknown): value is HistoricalPoint {
  return isRecord(value) && Boolean(parseUtc(value.timestamp_utc)) && finiteNonNegative(value.close_usd) && Number(value.close_usd) > 0;
}
function validHourlyHistory(value: unknown, t0: Date | null, scope: "7d" | "30d", requiredPoints: number): boolean {
  if (!Array.isArray(value) || !t0 || !value.every(isHistoricalPoint)) return false;
  const hourMs = 60 * 60 * 1000;
  const end = t0.getTime();
  const start = end - (scope === "7d" ? 168 : 720) * hourMs;
  const hours = new Set<number>();
  for (const point of value as HistoricalPoint[]) {
    const timestamp = parseUtc(point.timestamp_utc)!.getTime();
    if (timestamp > end) return false;
    if (timestamp < start) continue;
    const hour = Math.floor((timestamp - start) / hourMs);
    if (hours.has(hour)) return false;
    hours.add(hour);
  }
  if (hours.size < requiredPoints) return false;
  const sorted = [...hours].sort((a, b) => a - b);
  if (sorted[0] > 24 || sorted[sorted.length - 1] < (scope === "7d" ? 168 : 720) - 3) return false;
  return sorted.every((hour, index) => index === 0 || hour - sorted[index - 1] <= 24);
}
function parseUtc(value: unknown): Date | null {
  if (typeof value !== "string" || !value.endsWith("Z")) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function finiteNonNegative(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
