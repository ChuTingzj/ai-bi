'use client';

import { use } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatArea } from './_components/ChatArea';

export default function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex flex-1 flex-col">
        <ChatArea sessionId={sessionId} />
      </main>
    </div>
  );
}
