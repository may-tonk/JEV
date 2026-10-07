import type { Answer } from "./contract.js";
import type { ReportCatalog } from "./report-catalog.js";

export type ResearchDecision = {
  decision: "do_not_enter_now" | "wait_for_trigger" | "further_research" | "insufficient_evidence" | "deep_research" | "watchlist" | "monitor_only" | "do_not_prioritize";
  reasons: string[];
  required_conditions: string[];
};

export type DerivedDecision = {
  policy_version: "research-policy-v3";
  now: ResearchDecision;
  horizon_9m: ResearchDecision;
  horizon_18m: ResearchDecision;
  research_score: number;
  research_coverage: number;
  score_breakdown: Record<string, number>;
};

export function deriveResearchDecision(answers: Record<string, Answer>, catalog: ReportCatalog): DerivedDecision {
  const evidence = [
    choice(answers, "token_value_capture"),
    choice(answers, "supply_unlock_evidence"),
    choice(answers, "protocol_activity_trend"),
    choice(answers, "valuation_evidence"),
    choice(answers, "material_risk_evidence"),
  ];
  const missing = evidence.filter((value) => value === "not_covered" || value === "insufficient_evidence" || value === undefined).length;
  const risk = choice(answers, "material_risk_evidence");
  const direction7d = choice(answers, "short_term_direction_7d");
  const direction30d = choice(answers, "short_term_direction_30d");
  const researchPriority = choice(answers, "research_priority");
  const marketContext = choice(answers, "market_context");
  const riskSeverity = choice(answers, "risk_severity");
  const longTermBlocked = risk === "verified_blocker" || riskSeverity === "blocking_risk" || researchPriority === "blocked";
  const assessment = calculateResearchAssessment(answers, catalog);
  const currentReasons: string[] = [];

  if (direction7d === "high_downside_risk" || direction30d === "high_downside_risk" || risk === "verified_blocker" || riskSeverity === "blocking_risk") {
    if (direction7d === "high_downside_risk" || direction30d === "high_downside_risk") currentReasons.push("短期报告支持存在较高下行风险。");
    if (risk === "verified_blocker") currentReasons.push("报告存在已核实的阻断性问题。");
    if (riskSeverity === "blocking_risk") currentReasons.push("风险严重程度被判定为阻断性风险。");
    return {
      policy_version: "research-policy-v3",
      now: { decision: "do_not_enter_now", reasons: currentReasons, required_conditions: ["解除或核实所有阻断性风险后重新评估。"] },
      horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
      horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
      ...assessment,
    };
  }

  if (researchPriority === "blocked") {
    return {
      policy_version: "research-policy-v3",
      now: { decision: "do_not_enter_now", reasons: ["报告将项目标记为存在阻断性问题。"], required_conditions: ["解除阻断性问题后重新评估。"] },
      horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
      horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
      ...assessment,
    };
  }

  if (missing >= 2) {
    return {
      policy_version: "research-policy-v3",
      now: { decision: "insufficient_evidence", reasons: [`可信报告中有 ${missing} 个核心维度未被覆盖；研究优先级选项不能替代缺失证据。`], required_conditions: ["补充价值捕获、供应计划、业务趋势、估值基准和风险核查中未覆盖的维度。"] },
      horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
      horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
      ...assessment,
    };
  }

  if (researchPriority === "do_not_prioritize" || researchPriority === "monitor_only") {
    const notPrioritized = researchPriority === "do_not_prioritize";
    return {
      policy_version: "research-policy-v3",
      now: notPrioritized
        ? { decision: "do_not_prioritize", reasons: ["当前报告不支持把该项目列为高优先级研究对象。"], required_conditions: ["只有出现新的基本面、催化剂或估值变化时再复查。"] }
        : { decision: "monitor_only", reasons: ["报告仅支持持续跟踪，尚不足以提升为观察名单或深入研究。"], required_conditions: ["等待新证据或明确催化剂，再评估是否提高研究优先级。"] },
      horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
      horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
      ...assessment,
    };
  }

  if (researchPriority === "deep_research" && risk !== "verified_material_risk") {
    return {
      policy_version: "research-policy-v3",
      now: { decision: "deep_research", reasons: ["报告基本面、催化剂或发展条件支持提高研究优先级。", marketContext ? `市场背景：${marketContext}。` : ""].filter(Boolean), required_conditions: ["继续核查价值捕获、估值和关键风险，不将此结论当作交易指令。"] },
      horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
      horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
      ...assessment,
    };
  }

  if (researchPriority === "watchlist" || risk === "verified_material_risk") {
    return {
      policy_version: "research-policy-v3",
      now: { decision: "watchlist", reasons: [risk === "verified_material_risk" ? "存在需要管理的重大风险，项目仍可保留在观察名单。" : "项目存在研究价值，但仍有关键条件未解决。", marketContext ? `市场背景：${marketContext}。` : ""].filter(Boolean), required_conditions: ["跟踪价值捕获、估值、供应计划和市场表现的改善或恶化。"] },
      horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
      horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
      ...assessment,
    };
  }

  const nowDecision: ResearchDecision = risk === "verified_material_risk" || direction7d === "downside_risk" || direction30d === "downside_risk"
      ? { decision: "wait_for_trigger", reasons: ["存在已核实风险或下行信号，但尚未达到阻断性结论。"], required_conditions: ["完成风险核查并等待报告中列明的改善条件出现。"] }
      : { decision: "further_research", reasons: ["当前没有识别出阻断性风险，报告具备进入深入研究的基础。"], required_conditions: ["完成估值基准、供应计划和价值捕获机制的独立核查。"] };

  return {
    policy_version: "research-policy-v3",
    now: nowDecision,
    horizon_9m: longTermDecision(missing, longTermBlocked, risk, evidence),
    horizon_18m: longTermDecision(missing, longTermBlocked, risk, evidence),
    ...assessment,
  };
}

function calculateResearchAssessment(answers: Record<string, Answer>, catalog: ReportCatalog): Pick<DerivedDecision, "research_score" | "research_coverage" | "score_breakdown"> {
  let score = 0;
  let coveredWeight = 0;
  const breakdown: Record<string, number> = {};
  for (const [id, entry] of Object.entries(catalog)) {
    if (!entry.research_points || !entry.missing_option) continue;
    const answer = answers[id];
    const maxPoints = Math.max(...Object.values(entry.research_points));
    if (answer?.type !== "choice") {
      breakdown[id] = 0;
      continue;
    }
    const totalWeight = Object.values(answer.probabilities).reduce((total, weight) => total + weight, 0);
    const points = Object.entries(answer.probabilities).reduce((total, [option, weight]) =>
      total + weight * entry.research_points![option], 0) / totalWeight;
    score += points;
    breakdown[id] = Math.round(points * 10) / 10;
    coveredWeight += maxPoints * (1 - answer.probabilities[entry.missing_option] / totalWeight);
  }
  const rawScore = score;
  const riskSeverity = choice(answers, "risk_severity");
  if (riskSeverity === "blocking_risk" || choice(answers, "material_risk_evidence") === "verified_blocker" || choice(answers, "research_priority") === "blocked") score = 0;
  if (riskSeverity === "high_but_manageable") score = Math.min(score, 65);
  if (riskSeverity === "moderate") score = Math.min(score, 80);
  if (riskSeverity === "ordinary_monitoring") score = Math.min(score, 90);
  breakdown.risk_adjustment = Math.round((score - rawScore) * 10) / 10;
  return { research_score: Math.round(score), research_coverage: Math.round(coveredWeight), score_breakdown: breakdown };
}

function longTermDecision(missing: number, blocked: boolean, risk: string | undefined, evidence: Array<string | undefined>): ResearchDecision {
  if (blocked) return { decision: "do_not_enter_now", reasons: ["长期研究仍受阻断性问题影响。"], required_conditions: ["阻断性问题必须先得到解决或正式排除。"] };
  if (missing >= 2) return { decision: "insufficient_evidence", reasons: [`长期研究所需核心证据中有 ${missing} 项不足。`], required_conditions: ["补齐长期价值捕获、供应、业务、估值和风险证据。"] };
  if (risk === "verified_material_risk" || evidence.includes("token_level_unbenchmarked")) return { decision: "wait_for_trigger", reasons: ["存在重大风险或估值缺少基准，暂不应形成积极结论。"], required_conditions: ["补充可比较估值并完成重大风险的独立核查。"] };
  return { decision: "further_research", reasons: ["核心证据足以支持继续研究，但不构成交易指令。"], required_conditions: ["完成独立来源复核和长期跟踪。"] };
}

function choice(answers: Record<string, Answer>, id: string): string | undefined {
  const answer = answers[id];
  return answer?.type === "choice" ? answer.choice : undefined;
}
