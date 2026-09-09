import { type NextRequest } from 'next/server';
import { proxySsePost } from '@/lib/sse-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 900;

export async function POST(req: NextRequest) {
  return proxySsePost(req, '/api/lab/run');
}
