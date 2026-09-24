export function stripCodeFence(text: string): string {
  return text
    .replace(/^```[a-zA-Z]*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

export async function generateSqlWithLlm(params: {
  model: string;
  apiKey: string;
  apiBase: string;
  system: string;
  user: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const base = params.apiBase.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await (params.fetchImpl ?? fetch)(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
    const json = (await response.json()) as ChatCompletion;
    return stripCodeFence(json.choices?.[0]?.message?.content ?? '');
  } finally {
    clearTimeout(timer);
  }
}
