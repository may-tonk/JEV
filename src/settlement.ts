export type Horizon = "7d" | "30d";
export type SettlementOutcome = { status: "settled"; return_pct: number; band: string } | { status: "missing"; reason: string };

export function computeReturnPct(startPriceUsd: number, endPriceUsd: number): number {
  if (!positiveFinite(startPriceUsd) || !positiveFinite(endPriceUsd)) throw new Error("结算价格必须是正数。");
  return 100 * (endPriceUsd / startPriceUsd - 1);
}

export function settleReturn(input: {
  horizon: Horizon;
  t0Utc: string;
  startPriceUsd: number;
  startObservedAtUtc: string;
  endPriceUsd?: number;
  endObservedAtUtc?: string;
  source: string;
  endSource?: string;
  toleranceMinutes?: number;
}): SettlementOutcome {
  const t0 = parseUtc(input.t0Utc);
  const startObserved = parseUtc(input.startObservedAtUtc);
  const endObserved = parseUtc(input.endObservedAtUtc);
  if (!t0 || !startObserved || !endObserved || input.endPriceUsd === undefined) return { status: "missing", reason: "缺少有效的 t0、起点价格、终点价格或观察时间。" };
  const tolerance = (input.toleranceMinutes ?? 5) * 60 * 1000;
  const horizonMs = input.horizon === "7d" ? 168 * 3600000 : 720 * 3600000;
  if (Math.abs(startObserved.getTime() - t0.getTime()) > tolerance) return { status: "missing", reason: "起点价格超出 t0 允许时间窗。" };
  if (Math.abs(endObserved.getTime() - (t0.getTime() + horizonMs)) > tolerance) return { status: "missing", reason: "终点价格超出目标时间允许时间窗。" };
  if (input.endSource !== input.source) return { status: "missing", reason: "起点和终点价格来源不同。" };
  const returnPct = computeReturnPct(input.startPriceUsd, input.endPriceUsd);
  return { status: "settled", return_pct: returnPct, band: input.horizon === "7d" ? bandFor7d(returnPct) : bandFor30d(returnPct) };
}

function bandFor7d(value: number): string {
  if (value <= -10) return "fall_10_or_more";
  if (value <= -3) return "fall_3_to_10";
  if (value <= 3) return "range_minus3_plus3";
  if (value <= 10) return "rise_3_to_10";
  return "rise_over_10";
}
function bandFor30d(value: number): string {
  if (value <= -20) return "fall_20_or_more";
  if (value <= -5) return "fall_5_to_20";
  if (value <= 5) return "range_minus5_plus5";
  if (value <= 20) return "rise_5_to_20";
  return "rise_over_20";
}
function parseUtc(value: string | undefined): Date | null {
  if (typeof value !== "string" || !value.endsWith("Z")) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function positiveFinite(value: number): boolean { return Number.isFinite(value) && value > 0; }
