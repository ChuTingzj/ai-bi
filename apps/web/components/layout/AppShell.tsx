'use client';

import { useSidebarLayout } from '@/hooks/useSidebarLayout';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed, asideWidthPx, toggleCollapsed } = useSidebarLayout();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        widthPx={asideWidthPx}
        onToggleCollapsed={toggleCollapsed}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
