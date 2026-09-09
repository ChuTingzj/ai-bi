import { Agent, fetch as undiciFetch } from 'undici';
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

  // Must use undici's fetch with undici's Agent — Node/Next global fetch is an older
  // undici and rejects the v8 dispatcher ("invalid onRequestStart method").
  const upstream = await undiciFetch(`${apiBase}${upstreamPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: req.headers.get('authorization') ?? '',
    },
    body: await req.text(),
    signal: abort.signal,
    dispatcher: sseUpstreamAgent,
  });

  if (!upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/plain',
      },
    });
  }

  // undici's stream type is structurally compatible at runtime with Web BodyInit.
  return new Response(upstream.body as unknown as BodyInit, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
