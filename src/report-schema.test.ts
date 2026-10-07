import assert from "node:assert/strict";
import test from "node:test";
import { prepareReportState, validateReportState, type ReportState } from "./report-schema.js";

function state(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "report-v3",
    case_id: "demo-1",
    asset: { name: "Demo", symbol: "D", chain: "Ethereum", contract: "0x123" },
    snapshot: { t0_utc: "2026-09-20T08:58:00Z", report_cutoff_utc: "2026-09-20T08:58:00Z" },
    market: { spot_usd: 1, spot_source: "test", spot_observed_at_utc: "2026-09-20T08:58:00Z", liquidity_usd: 100000, volume_24h_usd: 1000000, historical_hourly: Array.from({ length: 720 }, (_, index) => ({ timestamp_utc: new Date(Date.parse("2026-09-20T08:58:00Z") - (720 - index) * 3600000).toISOString(), close_usd: 1 })).filter((_, index) => index % 10 !== 0) },
    raw_report: "report",
    ...overrides,
  };
}

test("report-v3 rejects a short-term report without historical prices", () => {
  const result = validateReportState({ ...state(), market: { ...state().market, historical_hourly: [] } }, { requireShortTerm: true, now: new Date("2026-09-21T00:00:00Z") });
  assert.equal(result.status, "not_evaluable");
  assert.ok(result.checks.some((check) => check.id === "historical_hourly" && !check.passed));
});

test("report-v3 accepts complete short-term metadata", () => {
  const result = validateReportState(state(), { requireShortTerm: true, now: new Date("2026-09-20T12:00:00Z") });
  assert.equal(result.status, "pass");
});

test("report-v3 base research does not require market history", () => {
  const value = state();
  delete (value as { market?: unknown }).market;
  const result = validateReportState(value, { scope: "base" });
  assert.equal(result.status, "pass");
});

test("base research accepts a complete raw report without parsed identity or report times", () => {
  const input = { schema_version: "report-v3", raw_report: "完整 Hermes 报告正文" };
  const prepared = prepareReportState(input, "2026-09-23T12:00:00Z") as ReportState;
  assert.match(prepared.case_id ?? "", /^report-[0-9a-f-]{36}$/);
  assert.equal(prepared.snapshot?.requested_at_utc, "2026-09-23T12:00:00Z");
  assert.equal(prepared.snapshot?.t0_utc, undefined);
  assert.equal(prepared.snapshot?.report_cutoff_utc, undefined);
  assert.equal(validateReportState(prepared, { scope: "base" }).status, "pass");
  const short = validateReportState(prepared, { scope: "7d", now: new Date("2026-09-23T12:00:00Z") });
  assert.equal(short.status, "not_evaluable");
  assert.ok(short.checks.some((check) => check.id === "snapshot_time" && !check.passed));
  assert.ok(short.checks.some((check) => check.id === "asset_identity" && !check.passed));
});

test("server preparation preserves supplied identity and report times", () => {
  const input = state();
  const prepared = prepareReportState(input, "2026-09-23T12:00:00Z") as ReportState;
  assert.equal(prepared.case_id, input.case_id);
  assert.equal(prepared.snapshot?.t0_utc, input.snapshot.t0_utc);
  assert.equal(prepared.snapshot?.report_cutoff_utc, input.snapshot.report_cutoff_utc);
  assert.equal(prepared.snapshot?.requested_at_utc, "2026-09-23T12:00:00Z");
});

test("report-v3 7d gate accepts a shorter history than the 30d gate", () => {
  const value = state();
  value.market.historical_hourly = Array.from({ length: 152 }, (_, index) => ({
    timestamp_utc: `2026-09-${String(14 + Math.floor(index / 24)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00Z`,
    close_usd: 1,
  }));
  const result = validateReportState(value, { scope: "7d", now: new Date("2026-09-20T12:00:00Z") });
  assert.equal(result.status, "pass");
});

test("short-term gate rejects repeated, future and clustered hourly prices", () => {
  const original = state();
  const now = new Date("2026-09-20T12:00:00Z");
  const repeated = state({ market: { ...original.market, historical_hourly: Array(648).fill(original.market.historical_hourly[0]) } });
  const future = state({ market: { ...original.market, historical_hourly: [...original.market.historical_hourly, { timestamp_utc: "2026-09-20T09:00:00Z", close_usd: 1 }] } });
  const fullHistory = Array.from({ length: 720 }, (_, index) => ({ timestamp_utc: new Date(Date.parse("2026-09-20T08:58:00Z") - (720 - index) * 3600000).toISOString(), close_usd: 1 }));
  const clustered = state({ market: { ...original.market, historical_hourly: fullHistory.filter((_, index) => index < 300 || index >= 336) } });
  for (const input of [repeated, future, clustered]) {
    const result = validateReportState(input, { scope: "30d", now });
    assert.equal(result.status, "not_evaluable");
    assert.ok(result.checks.some((check) => check.id === "historical_hourly" && !check.passed));
  }
});
