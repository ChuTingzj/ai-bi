import { type NextRequest } from 'next/server';
import { proxySsePost } from '@/lib/sse-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Allow long agent runs (planner → SQL retries → chart → analyst). */
export const maxDuration = 900;

/**
 * Next.js rewrites() 会缓冲上游 SSE，浏览器长时间看不到任何事件。
 * 独立 Route Handler 把 Nest 的 text/event-stream 原样转发给浏览器。
 */
export async function POST(req: NextRequest) {
  return proxySsePost(req, '/api/chat/stream');
}
