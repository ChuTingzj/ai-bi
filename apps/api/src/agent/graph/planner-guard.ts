/**
 * True when the question has no analytic signal (letters / CJK), e.g. "123321".
 * Such inputs must enter guidance instead of guessing a default table.
 */
export function questionLacksAnalyticSignal(question: string): boolean {
  const q = question.trim();
  if (!q) return true;
  // Any Unicode letter (Latin, CJK, etc.) counts as analytic signal.
  return !/\p{L}/u.test(q);
}
