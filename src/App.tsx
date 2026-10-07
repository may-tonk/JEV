import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Answer, Questions } from "./contract.js";
import type { ReportQuestionUi } from "./report-catalog.js";
import { parseHermesReport } from "./hermes-parser.js";
import { APP_BUILD_ID } from "./version.js";

type GateCheck = { id: string; passed: boolean; message: string };
type GateResult = { status: "pass" | "partial" | "not_evaluable"; checks: GateCheck[] };
type ResearchDecision = { decision: string; reasons: string[]; required_conditions: string[] };
type DerivedDecision = { policy_version: string; now: ResearchDecision; horizon_9m: ResearchDecision; horizon_18m: ResearchDecision; research_score?: number; research_coverage?: number; score_breakdown?: Record<string, number> };
type SkippedQuestion = { id: string; scope: string; reasons: string[] };
type Evaluation = { provider: "official"; scenario: "report"; model: string; latency_ms: number; answers: Record<string, Answer>; saved_file?: string; gate?: GateResult; derived_decision?: DerivedDecision; skipped_questions?: SkippedQuestion[]; interpretation_note?: string };
type HistoryItem = Evaluation & { file: string; requested_at: string; question_ids: string[] };
type Metadata = {
  case_id: string; name: string; symbol: string; chain: string; contract: string;
  t0_utc: string; report_cutoff_utc: string; spot_usd: string; spot_source: string;
  spot_observed_at_utc: string; liquidity_usd: string; volume_24h_usd: string; historical_hourly: string;
};

const decisionLabels: Record<string, string> = {
  do_not_enter_now: "当前不进入", wait_for_trigger: "等待条件", further_research: "进入深入研究", insufficient_evidence: "证据不足", deep_research: "值得深入研究", watchlist: "值得观察", monitor_only: "仅持续跟踪", do_not_prioritize: "暂不优先研究",
};
const initialMetadata: Metadata = {
  case_id: "", name: "", symbol: "", chain: "", contract: "", t0_utc: "", report_cutoff_utc: "", spot_usd: "", spot_source: "",
  spot_observed_at_utc: "", liquidity_usd: "", volume_24h_usd: "", historical_hourly: "",
};

export function App() {
  const [report, setReport] = useState("");
  const reportRef = useRef<HTMLTextAreaElement>(null);
  const [metadata, setMetadata] = useState<Metadata>(initialMetadata);
  const [selected, setSelected] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Questions>({});
  const [questionUi, setQuestionUi] = useState<Record<string, ReportQuestionUi>>({});
  const ids = Object.keys(questionUi);
  const titleFor = (id: string) => questionUi[id]?.title || id;
  const [officialAvailable, setOfficialAvailable] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [parseMessage, setParseMessage] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([fetch("/api/config"), fetch("/api/report-questions"), fetch("/api/report-results")])
      .then(async ([config, questionResponse, historyResponse]) => {
        if (!config.ok || !questionResponse.ok || !historyResponse.ok) throw new Error("无法连接本机服务，请刷新页面或重新运行 npm run dev。");
        return {
          config: await config.json() as { officialAvailable: boolean; questionSetVersion?: string; inputSchemaVersion?: string; buildId?: string },
          questions: await questionResponse.json() as { questions: Questions; ui: Record<string, ReportQuestionUi> },
          history: await historyResponse.json() as { results: HistoryItem[] },
        };
      })
      .then((data) => {
        setOfficialAvailable(data.config.officialAvailable); setQuestions(data.questions.questions); setQuestionUi(data.questions.ui || {}); setHistory(data.history.results);
        const loadedIds = Object.keys(data.questions.ui || {});
        setSelected(loadedIds);
        const ready = data.config.questionSetVersion === "report-v3" && data.config.inputSchemaVersion === "report-v3" && data.config.buildId === APP_BUILD_ID && loadedIds.length > 0 && loadedIds.length === Object.keys(data.questions.questions).length && loadedIds.every((id) => Object.hasOwn(data.questions.questions, id));
        setServerReady(ready);
        if (!ready) showError(`页面与本机服务版本不一致（需要 ${APP_BUILD_ID}，服务返回 ${data.config.buildId || "未知版本"}），请重启 npm run dev 后刷新页面。`);
        else if (!data.config.officialAvailable) setStatus("尚未配置 TypeSafe API Key。请检查本机 .env 后重启服务。");
      })
      .catch((error) => showError(error instanceof Error ? error.message : String(error)));
  }, []);

  function showError(message: string) { setStatus(message); setIsError(true); }
  function updateMetadata(field: keyof Metadata, value: string) { setMetadata((current) => ({ ...current, [field]: value })); }
  function parseReportIntoMetadata() {
    if (!report.trim()) return showError("请先粘贴 Hermes 报告，再进行自动解析。");
    const parsed = parseHermesReport(report);
    setMetadata((current) => ({
      ...current,
      case_id: parsed.case_id || current.case_id,
      name: parsed.name || current.name,
      symbol: parsed.symbol || current.symbol,
      chain: parsed.chain || current.chain,
      contract: parsed.contract || current.contract,
      t0_utc: parsed.t0_utc || current.t0_utc,
      report_cutoff_utc: parsed.report_cutoff_utc || current.report_cutoff_utc,
      spot_usd: parsed.spot_usd || current.spot_usd,
      spot_source: parsed.spot_source || current.spot_source,
      spot_observed_at_utc: parsed.spot_observed_at_utc || current.spot_observed_at_utc,
      liquidity_usd: parsed.liquidity_usd || current.liquidity_usd,
      volume_24h_usd: parsed.volume_24h_usd || current.volume_24h_usd,
    }));
    setParseWarnings(parsed.warnings);
    setParseMessage("已从 Hermes 报告提取可识别字段；未识别字段不会被猜测。");
    setStatus("自动解析完成，请确认黄色提示后提交。");
    setIsError(false);
  }
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : ids.filter((item) => current.includes(item) || item === id)); }
  function buildState() {
    const historical = metadata.historical_hourly.trim() ? JSON.parse(metadata.historical_hourly) : undefined;
    const parsed = parseHermesReport(report);
    const textValue = (field: keyof Metadata) => metadata[field].trim() || (field in parsed ? String(parsed[field as keyof typeof parsed] || "") : "");
    const toNumber = (value: string) => value.trim() ? Number(value) : undefined;
    return {
      schema_version: "report-v3", case_id: textValue("case_id"),
      asset: { name: textValue("name"), symbol: textValue("symbol"), chain: textValue("chain"), contract: textValue("contract") || undefined },
      snapshot: { t0_utc: textValue("t0_utc"), report_cutoff_utc: textValue("report_cutoff_utc") },
      market: {
        spot_usd: toNumber(metadata.spot_usd || String(parsed.spot_usd || "")), spot_source: textValue("spot_source"), spot_observed_at_utc: textValue("spot_observed_at_utc"),
        liquidity_usd: toNumber(metadata.liquidity_usd || String(parsed.liquidity_usd || "")), volume_24h_usd: toNumber(metadata.volume_24h_usd || String(parsed.volume_24h_usd || "")), historical_hourly: historical,
        return_7d_pct: parsed.return_7d_pct ? Number(parsed.return_7d_pct) : undefined,
        return_30d_pct: parsed.return_30d_pct ? Number(parsed.return_30d_pct) : undefined,
        return_1y_pct: parsed.return_1y_pct ? Number(parsed.return_1y_pct) : undefined,
      },
      raw_report: report.trim(),
      provenance: { provider: "Hermes", verification_status: "verified", trust_mode: "accept_explicit_claims" },
    };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report.trim()) return showError("请先粘贴完整报告。");
    if (!selected.length) return showError("请至少选择一个判断问题。");
    if (!serverReady) return showError("本机服务与页面版本不一致，请重启 npm run dev 后刷新页面。");
    let state: unknown;
    try { state = buildState(); } catch { return showError("历史小时价格必须是有效 JSON 数组。"); }
    const parsed = parseHermesReport(report);
    setParseWarnings(parsed.warnings);
    setLoading(true); setResult(null); setIsError(false); setStatus("正在向 TypeSafe 官方 Jev 发送 report-v3 结构化报告…");
    try {
      const response = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "report", state, question_ids: selected }) });
      const value = await response.json() as Evaluation & { error?: string; gate?: GateResult };
      if (!response.ok) {
        const failed = value.gate?.checks.filter((check) => !check.passed).map((check) => check.message).join("；");
        throw new Error(failed ? `${value.error || "输入门禁未通过"} ${failed}` : value.error || `请求失败：HTTP ${response.status}`);
      }
      setResult(value); setStatus("判断完成，report-v3 输入、问题和结果已保存到本机。");
      const saved = await fetch("/api/report-results"); if (saved.ok) setHistory((await saved.json() as { results: HistoryItem[] }).results);
    } catch (error) { showError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }

  return <div className="shell">
    <header className="header"><div className="brand"><span className="brand-mark">J</span><span className="brand-copy"><strong>Jev Studio</strong><small>决策研究工作台 · report-v3</small></span></div><span className="local-pill"><span className="connection-dot" />TypeSafe 官方 API · {officialAvailable ? "已配置" : "未配置"}</span></header>
    <main>
      <section className="intro"><div className="intro-content"><p className="eyebrow"><span className="eyebrow-line" /> DECISION INTELLIGENCE / 01</p><h1>一份报告，<br /><em>一条可复核的决策链。</em></h1><p className="intro-copy">先验证资产、时间、价格和证据边界，再让 Jev 判断风险与收益；最终研究行动由固定规则生成。</p><div className="intro-steps" aria-label="使用步骤"><span><b>01</b> 粘贴报告</span><i /><span><b>02</b> 自动提取</span><i /><span><b>03</b> 查看证据与行动</span></div></div><div className="hero-art" aria-hidden="true"><div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" /><div className="art-ring art-ring-three" /><div className="art-core">J<span>.</span></div><span className="art-label art-label-top">EVALUATE / JEV</span><span className="art-label art-label-bottom">INPUT → EVIDENCE → ACTION</span><span className="art-pip art-pip-one" /><span className="art-pip art-pip-two" /></div></section>
      <div className="workspace">
        <section className="panel input-panel" aria-labelledby="input-title"><div className="panel-top"><span className="step">01</span><div><h2 id="input-title">提交 Hermes 报告</h2><p>先粘贴原文，Jev 自动提取结构化字段</p></div><span className="panel-kicker">SOURCE</span></div>
          <form onSubmit={submit}>
            <div className="input-label-row"><label htmlFor="report">Hermes 报告原文 <span className="required-mark">唯一必填</span></label><div className="report-actions"><button type="button" className="parse-report-button" disabled={!report.trim()} onClick={parseReportIntoMetadata}>自动提取字段</button><button type="button" className="clear-report-button" disabled={!report} onClick={() => { setReport(""); setParseMessage(""); setParseWarnings([]); reportRef.current?.focus(); }} aria-label="清空当前报告" title="只清空输入框，不影响历史判断"><span aria-hidden="true">×</span> 清空报告</button></div></div>
            <textarea ref={reportRef} id="report" value={report} onChange={(event) => setReport(event.target.value)} rows={16} placeholder="把 Hermes 生成的完整报告粘贴在这里…" />
            <div className="field-footer"><span><span className="field-icon">↳</span> 原文作为证据上下文保留</span><span>{report.length.toLocaleString("zh-CN")} 字符</span></div>
            {parseMessage && <p className="parse-message">✓ {parseMessage}</p>}
            {parseWarnings.length > 0 && <div className="parse-warnings"><strong>需要确认或补充：</strong><ul>{parseWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            <details className="metadata-details"><summary>查看 / 修正自动提取的结构化字段</summary><div className="metadata-grid">{(["case_id", "name", "symbol", "chain", "contract", "t0_utc", "report_cutoff_utc", "spot_usd", "spot_source", "spot_observed_at_utc", "liquidity_usd", "volume_24h_usd"] as const).map((field) => <label key={field} className="metadata-field"><span>{metadataLabel(field)}</span><input value={metadata[field]} onChange={(event) => updateMetadata(field, event.target.value)} placeholder={metadataPlaceholder(field)} type={field.endsWith("_usd") ? "number" : "text"} step={field.endsWith("_usd") ? "any" : undefined} /></label>)}</div><label className="metadata-field history-field"><span>小时价格 JSON（仅对应短期判断时需要；7 天与 30 天分别校验）</span><textarea className="compact-textarea" value={metadata.historical_hourly} onChange={(event) => updateMetadata("historical_hourly", event.target.value)} placeholder='[{"timestamp_utc":"2026-09-20T08:00:00Z","close_usd":0.0037}]' rows={3} /></label></details>
            <div className="question-section"><div className="question-header"><div><p className="section-kicker">DECISION SET / V3</p><h3>判断问题</h3></div><span>{selected.length} / {ids.length} 已选择</span></div><p className="section-description">研究价值判断使用报告汇总信息；小时数据只影响精确短期预测。</p><div className="question-grid">{ids.map((id, index) => <label key={id} className={`question-option${selected.includes(id) ? " selected" : ""}`}><input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} /><span className="question-option-body"><span className="question-tag">{questionUi[id].group} / {String(index + 1).padStart(2, "0")}</span><strong>{questionUi[id].title}</strong><small>{questionUi[id].description}</small></span></label>)}</div><details className="rules"><summary>查看当前选择范围</summary>{selected.map((id) => { const q = questions[id]; return q?.type === "choice" ? <div key={id} className="rule-group"><strong>{titleFor(id)}</strong><ul className="rule-list">{Object.entries(q.criteria).map(([key, description]) => <li key={key}><span>{questionUi[id]?.labels[key] || key}</span><small>{description}</small></li>)}</ul></div> : null; })}</details></div>
            <button type="submit" className="primary-button" disabled={loading || !officialAvailable || !serverReady || !report.trim() || !selected.length}><span>{loading ? "Jev 正在判断…" : "交给 Jev 判断"}<small>{loading ? "执行 report-v3" : "输入门禁 · 证据 · 条件预测"}</small></span><span className="button-arrow" aria-hidden="true">↗</span></button>{status && <p className={`status${isError ? " error" : ""}`} role="status">{status}</p>}
          </form>
        </section>
        <section className={`panel output-panel${result ? " has-result" : ""}`} aria-labelledby="output-title"><div className="panel-top"><span className="step">02</span><div><h2 id="output-title">证据与行动</h2><p>可评估的模块继续运行，缺失数据只跳过对应模块</p></div><span className="panel-kicker">OUTPUT</span></div>{result ? <div className="result-content"><p className="meta">TypeSafe 官方 Jev · {result.model} · {result.latency_ms} ms</p><div className="result-scroll" role="region" aria-label="report-v3 判断结果，可独立滚动" tabIndex={0}>{result.derived_decision && <DecisionCard decision={result.derived_decision} />}{result.gate && <GateCard gate={result.gate} />}{result.skipped_questions && result.skipped_questions.length > 0 && <SkippedCard questions={result.skipped_questions} ui={questionUi} />}<div className="answers">{Object.entries(result.answers).map(([id, answer]) => <AnswerCard key={id} id={id} answer={answer} ui={questionUi[id]} />)}</div><p className="result-note">V3 中收益权重只在对应短期数据门禁通过后产生；选项权重用于启发式研究评分，并非已校准的金融概率。研究行动由 {result.derived_decision?.policy_version || "研究规则"} 生成。</p>{result.saved_file && <p className="saved-result">本机已保存：{result.saved_file}</p>}<details className="raw-details"><summary>查看完整 API 响应</summary><pre>{JSON.stringify(result, null, 2)}</pre></details></div></div> : <div className="empty-state"><div className="empty-orbit" aria-hidden="true"><span className="empty-orbit-inner">J</span></div><span className="empty-eyebrow">READY WHEN YOU ARE</span><h3>等待第一份 V3 报告</h3><p>粘贴 Hermes 原文后即可开始；短期数据不足不会阻塞基础研究。</p></div>}</section>
      </div>
      <details className="history"><summary><span>过往 V3 判断 <small>HISTORY</small></span><span className="history-count">{history.length} 条记录 <b aria-hidden="true">⌄</b></span></summary>{history.length ? history.map((item) => <button type="button" className="history-row" key={item.file} onClick={() => { setResult(item); setStatus(`已打开 ${formatDate(item.requested_at)} 的 V3 历史判断。`); }}><span>{formatDate(item.requested_at)}</span><span>{item.question_ids.map(titleFor).join("、")}</span><span>查看 ↗</span></button>) : <p>还没有保存的 V3 报告判断。</p>}</details>
    </main>
  </div>;
}

function metadataLabel(field: keyof Metadata): string { const labels: Partial<Record<keyof Metadata, string>> = { case_id: "案例 ID（可选）", name: "资产名称", symbol: "代币符号", chain: "链", contract: "合约地址", t0_utc: "决策时间 t0（仅精确短期判断需要）", report_cutoff_utc: "报告截止时间（仅精确短期判断需要）", spot_usd: "起点 USD 价格", spot_source: "起点价格来源", spot_observed_at_utc: "价格观察时间（UTC，Z 结尾）", liquidity_usd: "流动性 USD", volume_24h_usd: "24 小时成交量 USD" }; return labels[field] || field; }
function metadataPlaceholder(field: keyof Metadata): string { if (field.endsWith("_utc")) return "基础研究可留空；精确短期判断需补充 UTC 时间"; if (field === "case_id") return "留空时由服务端生成"; if (field === "spot_source") return "报告未明确时，短期判断前补充"; if (field === "contract") return "基础研究可留空；精确短期判断需真实合约"; if (field === "liquidity_usd" || field === "volume_24h_usd") return "短期判断时需要；报告未提供可留空"; return "自动提取；报告未提供可留空"; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false }); }
function AnswerCard({ id, answer, ui }: { id: string; answer: Answer; ui?: ReportQuestionUi }) { return <article className="answer-card"><div className="answer-heading"><span>{ui?.title || id}</span><span className="answer-kind">{answer.type.toUpperCase()}</span></div>{answer.type === "choice" ? <><div className="answer-main">{ui?.labels[answer.choice] || answer.choice}</div><OptionScoreList probabilities={answer.probabilities} labels={ui?.labels} /><p className="answer-note">各选项相对评分总分 100；模型置信度为 {(answer.confidence * 100).toFixed(0)}%。这些值未经投资结果校准。</p></> : answer.type === "score" ? <><div className="answer-main">{formatNumber(answer.score)}</div><ProbabilityList probabilities={answer.probabilities} legend={answer.legend} /></> : <div className="answer-main">{Math.round(answer.noul * 100)}%</div>}</article>; }
function OptionScoreList({ probabilities, labels }: { probabilities: Record<string, number>; labels?: Record<string, string> }) { const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]); return <div className="option-score-list"><div className="option-score-title">选项相对评分 / 100</div>{sorted.map(([key, value]) => <div className="probability-row" key={key}><span title={labels?.[key] || key}>{labels?.[key] || key}</span><div className="probability-track"><div className="probability-fill" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div><strong>{(value * 100).toFixed(1)}</strong></div>)}</div>; }
function ProbabilityList({ probabilities, legend }: { probabilities: Record<string, number>; legend?: Record<string, string> }) { const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]); const row = ([key, value]: [string, number]) => <div className="probability-row" key={key}><span title={legend?.[key] || key}>{legend?.[key] || key}</span><div className="probability-track"><div className="probability-fill" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div><strong>{(value * 100).toFixed(1)}%</strong></div>; return <><div className="probabilities">{sorted.slice(0, 3).map(row)}</div>{sorted.length > 3 && <details className="more-probabilities"><summary>查看其余 {sorted.length - 3} 个选项</summary><div className="probabilities">{sorted.slice(3).map(row)}</div></details>}</>; }
function DecisionCard({ decision }: { decision: DerivedDecision }) { return <article className="decision-card"><p className="decision-kicker">RESEARCH POLICY / {decision.policy_version}</p><h3>当前行动：{decisionLabels[decision.now.decision] || decision.now.decision}</h3>{decision.research_score !== undefined && <div className="research-score"><strong>研究价值评分：{decision.research_score} / 100</strong><span>信息覆盖度：{decision.research_coverage ?? 0}%</span></div>}<p>{decision.now.reasons.join(" ")}</p><div className="decision-grid"><div><strong>长期研究条件（9 / 18 个月共用）</strong><span>{decisionLabels[decision.horizon_9m.decision] || decision.horizon_9m.decision}</span></div></div><p className="result-note">当前没有独立的 9 个月与 18 个月预测模型；这里仅表示长期研究条件。</p><small>重新评估条件：{decision.now.required_conditions.join("；")}</small></article>; }
function GateCard({ gate }: { gate: GateResult }) { const failed = gate.checks.filter((check) => !check.passed); const label = gate.status === "pass" ? "全部通过" : gate.status === "partial" ? "部分通过" : "不可评估"; return <article className="gate-card"><strong>输入门禁：{label}</strong>{failed.length ? <ul>{failed.slice(0, 8).map((check) => <li key={check.id}>{check.message}</li>)}</ul> : <p>基础研究和当前选择的判断题均满足所需数据条件。</p>}</article>; }
function SkippedCard({ questions, ui }: { questions: SkippedQuestion[]; ui: Record<string, ReportQuestionUi> }) { return <article className="skipped-card"><strong>已跳过的判断模块</strong><p>以下模块缺少专属数据，因此没有强行生成答案；其余模块已经继续执行。</p><ul>{questions.map((item) => <li key={item.id}><b>{ui[item.id]?.title || item.id}</b><span>{item.reasons.join("；")}</span></li>)}</ul></article>; }
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""); }
