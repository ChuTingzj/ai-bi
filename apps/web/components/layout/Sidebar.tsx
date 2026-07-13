'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h1 className="text-lg font-bold">DataMind AI-BI</h1>
        <p className="text-xs text-slate-400">对话即图表</p>
      </div>

      <button
        onClick={handleNew}
        className="mx-3 mt-3 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + 新对话
      </button>

      <nav className="mt-3 flex-1 overflow-y-auto px-2">
        {sessions?.map((s) => (
          <Link
            key={s.id}
            href={`/chat/${s.id}`}
            className={`group mb-1 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              pathname === `/chat/${s.id}`
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="truncate">{s.title}</span>
            <button
              onClick={(e) => handleDelete(e, s.id)}
              className="ml-2 hidden text-slate-400 hover:text-red-500 group-hover:block"
              title="删除会话"
            >
              ×
            </button>
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3 text-sm">
        <Link
          href="/dashboard"
          className={`block rounded-lg px-3 py-2 ${
            pathname === '/dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          我的 Dashboard
        </Link>
        <Link
          href="/admin/datasources"
          className={`block rounded-lg px-3 py-2 ${
            pathname === '/admin/datasources' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          数据源管理
        </Link>
        <button
          onClick={handleLogout}
          className="mt-1 w-full rounded-lg px-3 py-2 text-left text-slate-500 hover:bg-slate-100"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
