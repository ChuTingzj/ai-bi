'use client';

import { use } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ChatArea } from './_components/ChatArea';

export default function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <AppShell>
      <ChatArea sessionId={sessionId} />
    </AppShell>
  );
}
