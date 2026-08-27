'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isLoggedIn } from '@/lib/auth';
import { useSessions, useCreateSession } from '@/hooks/useSessions';

export default function HomePage() {
  const router = useRouter();
  const { data: sessions, isLoading } = useSessions();
  const createSession = useCreateSession();

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }
    if (isLoading || !sessions) return;

    if (sessions.length > 0) {
      router.replace(`/chat/${sessions[0].id}`);
    } else {
      createSession.mutate(
        {},
        { onSuccess: (s) => router.replace(`/chat/${s.id}`) },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, sessions]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      正在加载...
    </div>
  );
}
