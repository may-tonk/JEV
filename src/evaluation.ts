export type Prediction = { eligible: boolean; actualClass?: string; probabilities: Record<string, number> };

export function coverage(predictions: Prediction[]): number {
  const eligible = predictions.filter((item) => item.eligible);
  if (!eligible.length) return 0;
  return eligible.filter((item) => item.actualClass !== undefined).length / eligible.length;
}

export function top1Accuracy(predictions: Prediction[]): number {
  const scored = predictions.filter((item) => item.eligible && item.actualClass !== undefined);
  if (!scored.length) return 0;
  return scored.filter((item) => topClass(item.probabilities) === item.actualClass).length / scored.length;
}

export function brierScore(predictions: Prediction[]): number {
  const scored = predictions.filter((item) => item.eligible && item.actualClass !== undefined);
  if (!scored.length) return 0;
  return scored.reduce((total, item) => total + Object.entries(item.probabilities).reduce((sum, [key, probability]) => sum + (probability - (key === item.actualClass ? 1 : 0)) ** 2, 0), 0) / scored.length;
}

export function logLoss(predictions: Prediction[]): number {
  const scored = predictions.filter((item) => item.eligible && item.actualClass !== undefined);
  if (!scored.length) return 0;
  return scored.reduce((total, item) => total - Math.log(Math.max(1e-15, item.probabilities[item.actualClass!] ?? 0)), 0) / scored.length;
}

function topClass(probabilities: Record<string, number>): string | undefined {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0];
}
