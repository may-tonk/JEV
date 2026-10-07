import assert from "node:assert/strict";
import test from "node:test";
import { parseHermesReport } from "./hermes-parser.js";

test("Hermes parser extracts explicit market fields without inventing sources", () => {
  const parsed = parseHermesReport(`
# AAVE 蓝筹深度分析
数据采集时点：2026-09-21 13:00–13:04 UTC
代币合约：0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9（ETH 主网）
- 价格：$147.7
- 24h 成交量：$3.45 亿
近 7 日 +17.7% / 近 30 日 +17.6% / 近 1 年 -50.1%
`);
  assert.equal(parsed.symbol, "AAVE");
  assert.equal(parsed.chain, "Ethereum");
  assert.equal(parsed.contract, "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9");
  assert.equal(parsed.t0_utc, "2026-09-21T13:04:00Z");
  assert.equal(parsed.spot_usd, "147.7");
  assert.equal(parsed.volume_24h_usd, "345000000");
  assert.equal(parsed.return_7d_pct, "+17.7");
  assert.equal(parsed.return_30d_pct, "+17.6");
  assert.equal(parsed.return_1y_pct, "-50.1");
  assert.equal(parsed.spot_source, undefined);
  assert.ok(parsed.warnings.some((warning) => warning.includes("价格来源")));
});
