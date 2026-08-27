'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChartBar,
  Code,
  Database,
  Plus,
  SignOut,
  Trash,
} from '@phosphor-icons/react';
import { useSessions, useCreateSession, useDeleteSession } from '@/hooks/useSessions';
import { clearTokens } from '@/lib/auth';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: sessions } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  function handleNew() {
    createSession.mutate(
      {},
      { onSuccess: (s) => router.push(`/chat/${s.id}`) },
    );
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    deleteSession.mutate(id, {
      onSuccess: () => {
        if (pathname === `/chat/${id}`) router.push('/');
      },
    });
  }

  function handleLogout() {
    clearTokens();
    router.push('/login');
  }

  const navItemClass = (active: boolean) =>
    `flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? 'bg-border-strong text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <h1 className="text-lg font-bold text-foreground">DataMind AI-BI</h1>
        <p className="text-xs text-muted-foreground">对话即图表</p>
      </div>

      <button
        onClick={handleNew}
        className="mx-3 mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90"
      >
        <Plus size={16} aria-hidden="true" />
        新对话
      </button>

      <nav className="mt-3 flex-1 overflow-y-auto px-2" aria-label="会话列表">
        {sessions?.map((s) => (
          <Link
            key={s.id}
            href={`/chat/${s.id}`}
            className={`group mb-1 flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === `/chat/${s.id}`
                ? 'bg-border-strong text-primary'
                : 'text-foreground hover:bg-muted'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate" title={s.title}>
                {s.title}
              </span>
              {s.dataSourceName ? (
                <span
                  className="block truncate text-xs text-muted-foreground"
                  title={s.dataSourceName}
                >
                  {s.dataSourceName}
                </span>
              ) : null}
            </span>
            <button
              onClick={(e) => handleDelete(e, s.id)}
              className="ml-2 hidden min-h-8 min-w-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-destructive group-hover:flex"
              title="删除会话"
              aria-label={`删除会话 ${s.title}`}
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-3 text-sm">
        <Link href="/lab" className={navItemClass(pathname === '/lab' || pathname.startsWith('/lab'))}>
          <Code size={16} aria-hidden="true" />
          SQL Lab
        </Link>
        <Link href="/dashboard" className={navItemClass(pathname === '/dashboard')}>
          <ChartBar size={16} aria-hidden="true" />
          我的 Dashboard
        </Link>
        <Link
          href="/admin/datasources"
          className={navItemClass(pathname === '/admin/datasources')}
        >
          <Database size={16} aria-hidden="true" />
          数据源管理
        </Link>
        <button
          onClick={handleLogout}
          className="mt-1 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted"
        >
          <SignOut size={16} aria-hidden="true" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
