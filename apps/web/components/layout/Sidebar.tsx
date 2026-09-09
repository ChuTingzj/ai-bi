'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChartBar,
  Code,
  Database,
  Plus,
  Sidebar as SidebarIcon,
  SignOut,
  Trash,
} from '@phosphor-icons/react';
import { useSessions, useCreateSession, useDeleteSession } from '@/hooks/useSessions';
import { clearTokens } from '@/lib/auth';

type SidebarProps = {
  collapsed: boolean;
  widthPx: number;
  hydrated: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({
  collapsed,
  widthPx,
  hydrated,
  onToggleCollapsed,
}: SidebarProps) {
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

  const collapsedNavItemClass = (active: boolean) =>
    `flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg transition-colors ${
      active
        ? 'bg-border-strong text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  const sidebarToggleLabel = collapsed ? '展开侧边栏' : '收起侧边栏';

  return (
    <aside
      id="app-sidebar"
      style={{ width: widthPx }}
      className={`flex h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card ${
        hydrated
          ? 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
          : ''
      }`}
      aria-label="主导航"
    >
      <div
        className={`flex border-b border-border ${
          collapsed ? 'flex-col items-center gap-2 px-2 py-3' : 'items-center justify-between p-4'
        }`}
      >
        {collapsed ? (
          <span
            className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary"
            aria-hidden="true"
          >
            D
          </span>
        ) : (
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-foreground">DataMind AI-BI</h1>
            <p className="text-xs text-muted-foreground">对话即图表</p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex min-h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          aria-label={sidebarToggleLabel}
          title={sidebarToggleLabel}
        >
          <SidebarIcon size={18} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={handleNew}
        className={`mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-primary text-sm font-medium text-on-primary transition-colors hover:opacity-90 ${
          collapsed ? 'mx-auto min-w-11' : 'mx-3 gap-1.5 py-2'
        }`}
        aria-label={collapsed ? '新对话' : undefined}
        title={collapsed ? '新对话' : undefined}
      >
        <Plus size={16} aria-hidden="true" />
        {collapsed ? null : '新对话'}
      </button>

      {collapsed ? (
        <div className="flex-1" />
      ) : (
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
      )}

      {collapsed ? (
        <div className="flex flex-col items-center border-t border-border p-2 text-sm">
          <Link
            href="/lab"
            className={collapsedNavItemClass(
              pathname === '/lab' || pathname.startsWith('/lab'),
            )}
            title="SQL Lab"
            aria-label="SQL Lab"
          >
            <Code size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/dashboard"
            className={collapsedNavItemClass(pathname === '/dashboard')}
            title="我的 Dashboard"
            aria-label="我的 Dashboard"
          >
            <ChartBar size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/admin/datasources"
            className={collapsedNavItemClass(pathname === '/admin/datasources')}
            title="数据源管理"
            aria-label="数据源管理"
          >
            <Database size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            title="退出登录"
            aria-label="退出登录"
          >
            <SignOut size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="border-t border-border p-3 text-sm">
          <Link
            href="/lab"
            className={navItemClass(pathname === '/lab' || pathname.startsWith('/lab'))}
          >
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
            type="button"
            onClick={handleLogout}
            className="mt-1 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted"
          >
            <SignOut size={16} aria-hidden="true" />
            退出登录
          </button>
        </div>
      )}
    </aside>
  );
}
