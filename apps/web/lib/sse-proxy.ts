import { Agent } from 'undici';
import { type NextRequest } from 'next/server';

/** Disable undici idle body timeout — SSE can be quiet for minutes between events. */
const sseUpstreamAgent = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 30_000,
});

export async function proxySsePost(
  req: NextRequest,
  upstreamPath: string,
): Promise<Response> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort());

  const upstream = await fetch(`${apiBase}${upstreamPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: req.headers.get('authorization') ?? '',
    },
    body: await req.text(),
    cache: 'no-store',
    signal: abort.signal,
    // Node/undici extension used by the SSE proxy (not in DOM fetch typings).
    dispatcher: sseUpstreamAgent,
  } as RequestInit & { dispatcher: Agent });

  if (!upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/plain',
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
