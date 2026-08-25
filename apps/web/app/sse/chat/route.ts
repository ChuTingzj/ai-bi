import { type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Next.js rewrites() 会缓冲上游 SSE，浏览器长时间看不到任何事件。
 * 独立 Route Handler 把 Nest 的 text/event-stream 原样转发给浏览器。
 */
export async function POST(req: NextRequest) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort());

  const upstream = await fetch(`${apiBase}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: req.headers.get('authorization') ?? '',
    },
    body: await req.text(),
    cache: 'no-store',
    signal: abort.signal,
  });

  if (!upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'text/plain' },
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
