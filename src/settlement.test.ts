import assert from "node:assert/strict";
import test from "node:test";
import { settleReturn } from "./settlement.js";

test("settlement uses exact horizon, same source and fixed V3 bands", () => {
  const result = settleReturn({
    horizon: "7d", t0Utc: "2026-09-20T08:58:00Z", startPriceUsd: 100, startObservedAtUtc: "2026-09-20T08:58:00Z",
    endPriceUsd: 105, endObservedAtUtc: "2026-09-27T08:58:00Z", source: "source-a", endSource: "source-a",
  });
  assert.equal(result.status, "settled");
  if (result.status === "settled") {
    assert.ok(Math.abs(result.return_pct - 5) < 1e-9);
    assert.equal(result.band, "rise_3_to_10");
  }
});

test("settlement refuses a changed source or out-of-window quote", () => {
  const changedSource = settleReturn({ horizon: "30d", t0Utc: "2026-09-20T08:58:00Z", startPriceUsd: 1, startObservedAtUtc: "2026-09-20T08:58:00Z", endPriceUsd: 1.1, endObservedAtUtc: "2026-10-20T08:58:00Z", source: "a", endSource: "b" });
  assert.equal(changedSource.status, "missing");
  const late = settleReturn({ horizon: "7d", t0Utc: "2026-09-20T08:58:00Z", startPriceUsd: 1, startObservedAtUtc: "2026-09-20T08:58:00Z", endPriceUsd: 1.1, endObservedAtUtc: "2026-09-27T10:00:00Z", source: "a", endSource: "a" });
  assert.equal(late.status, "missing");
});
