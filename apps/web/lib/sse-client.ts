import type { SseEvent } from '@ai-bi/shared';
import { getAccessToken } from './auth';

export async function* streamChat(
  sessionId: string,
  message: string,
  dataSourceId?: string,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({ sessionId, message, dataSourceId }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`对话请求失败: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as SseEvent;
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
