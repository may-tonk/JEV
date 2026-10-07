export type HermesParsedFields = {
  case_id?: string;
  name?: string;
  symbol?: string;
  chain?: string;
  contract?: string;
  t0_utc?: string;
  report_cutoff_utc?: string;
  spot_usd?: string;
  spot_source?: string;
  spot_observed_at_utc?: string;
  liquidity_usd?: string;
  volume_24h_usd?: string;
  return_7d_pct?: string;
  return_30d_pct?: string;
  return_1y_pct?: string;
  warnings: string[];
};

export function parseHermesReport(report: string): HermesParsedFields {
  const result: HermesParsedFields = { warnings: [] };
  const text = report.trim();
  if (!text) return result;

  const heading = text.match(/^\s*#?\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s+[^\n]+/m);
  if (heading) {
    result.symbol = heading[1].toUpperCase();
    result.name = heading[1].toUpperCase();
  }

  const contract = text.match(/0x[a-fA-F0-9]{40}/);
  if (contract) result.contract = contract[0];

  const chain = text.match(/代币合约[^\n]*?（([^）]+)）/);
  if (chain) result.chain = normalizeChain(chain[1]);

  const time = text.match(/数据采集时点\s*[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})\s*UTC/i);
  if (time) {
    const end = `${time[1]}T${time[3]}:00Z`;
    result.t0_utc = end;
    result.report_cutoff_utc = end;
    result.spot_observed_at_utc = end;
  } else {
    result.warnings.push("未识别到精确采集时间；基础研究可继续，精确短期判断需要补充时间。");
  }

  const price = text.match(/价格\s*[：:]\s*\$?([\d,.]+)/);
  if (price) result.spot_usd = cleanNumber(price[1]);

  const source = text.match(/(?:价格来源|spot\s*source)\s*[：:]\s*([^\n]+)/i);
  if (source) result.spot_source = source[1].trim();
  else result.warnings.push("报告没有明确起点价格来源，短期判断前需要补充来源。");

  const volume = text.match(/24h\s*成交量\s*[：:]\s*\$?([\d.,]+)\s*(亿|万|[BMK])?/i);
  if (volume) result.volume_24h_usd = normalizeAmount(volume[1], volume[2]);

  const return7d = text.match(/近\s*7\s*日[^+\-\d]{0,20}([+\-]?\s*[\d.,]+)\s*%/i);
  const return30d = text.match(/近\s*30\s*日[^+\-\d]{0,20}([+\-]?\s*[\d.,]+)\s*%/i);
  const return1y = text.match(/近\s*1\s*年[^+\-\d]{0,20}([+\-]?\s*[\d.,]+)\s*%/i);
  if (return7d) result.return_7d_pct = cleanNumber(return7d[1].replace(/\s/g, ""));
  if (return30d) result.return_30d_pct = cleanNumber(return30d[1].replace(/\s/g, ""));
  if (return1y) result.return_1y_pct = cleanNumber(return1y[1].replace(/\s/g, ""));

  const liquidity = text.match(/流动性(?:\s*USD)?\s*[：:]\s*\$?([\d.,]+)\s*(亿|万|[BMK])?/i);
  if (liquidity) result.liquidity_usd = normalizeAmount(liquidity[1], liquidity[2]);
  else result.warnings.push("报告没有明确流动性，不能用成交量替代流动性。");

  if (result.symbol && result.t0_utc) result.case_id = `${result.symbol}-${result.t0_utc.slice(0, 16).replace(/[-:T]/g, "")}`;
  if (!text.match(/小时价格|historical_hourly|timestamp_utc/i)) result.warnings.push("报告没有小时级价格序列，短期收益区间将按数据门禁单独跳过。");
  return result;
}

function cleanNumber(value: string): string { return value.replace(/,/g, ""); }

function normalizeAmount(value: string, unit?: string): string {
  const number = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(number)) return "";
  const multiplier = unit?.toUpperCase() === "亿" ? 100_000_000
    : unit?.toUpperCase() === "万" ? 10_000
      : unit?.toUpperCase() === "B" ? 1_000_000_000
        : unit?.toUpperCase() === "M" ? 1_000_000
          : unit?.toUpperCase() === "K" ? 1_000 : 1;
  return String(number * multiplier);
}

function normalizeChain(value: string): string {
  const chain = value.trim();
  if (/^ETH\b|以太坊|Ethereum/i.test(chain)) return "Ethereum";
  return chain;
}
