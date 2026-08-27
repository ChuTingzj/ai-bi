export const DEFAULT_SESSION_TITLE = '新对话';
export const MAX_SESSION_TITLE_LENGTH = 16;

const FILLER_PREFIXES = [
  '请帮我看一下',
  '请帮我查一下',
  '帮我看一下',
  '帮我查一下',
  '请帮我分析',
  '请帮我查询',
  '请帮我',
  '我想查询',
  '我想看',
  '请问一下',
  '请问',
  '帮我',
];

export function clipTitle(text: string): string {
  return Array.from(text).slice(0, MAX_SESSION_TITLE_LENGTH).join('');
}

/** Strip polite filler and clip to a sidebar-sized title. */
export function heuristicTitle(question: string): string {
  let text = question.replace(/\s+/g, ' ').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of FILLER_PREFIXES) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trimStart();
        changed = true;
        break;
      }
    }
  }
  text = text.replace(/[?？。.!！,，、]+$/g, '').trim();
  const clipped = clipTitle(text);
  if (clipped && clipped !== DEFAULT_SESSION_TITLE) return clipped;
  const fromOriginal = clipTitle(question.replace(/\s+/g, ' ').trim());
  return fromOriginal || '数据分析';
}

export function sanitizeTitle(raw: string, fallbackQuestion: string): string {
  let text = raw
    .replace(/^```[a-zA-Z]*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  text = text.replace(/^["「『“'']+|["」』”'']+$/g, '').trim();
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/^(标题|会话标题)[：:]\s*/u, '');
  text = text.replace(/[?？。.!！,，、]+$/g, '').trim();
  const clipped = clipTitle(text);
  if (!clipped || clipped === DEFAULT_SESSION_TITLE) {
    return heuristicTitle(fallbackQuestion);
  }
  return clipped;
}
