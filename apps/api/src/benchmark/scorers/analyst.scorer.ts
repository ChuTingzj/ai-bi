export function scoreAnalyst(
  analyst_text: string,
  keywords: string[] = [],
): number {
  if (!analyst_text.trim()) return 0;
  if (keywords.length === 0) return 1;

  const lower = analyst_text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) hits += 1;
  }
  return hits / keywords.length;
}
