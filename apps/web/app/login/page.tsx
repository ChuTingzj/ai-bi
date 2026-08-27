'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AuthTokensDto, UserDto } from '@ai-bi/shared';
import { api } from '@/lib/api';
import { saveTokens } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await api.post<UserDto>('/api/auth/register', { email, password, name });
      }
      const tokens = await api.post<AuthTokensDto>('/api/auth/login', {
        email,
        password,
      });
      saveTokens(tokens.accessToken, tokens.refreshToken);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <h1 className="mb-1 text-2xl font-bold text-foreground">DataMind AI-BI</h1>
        <p className="mb-6 text-sm text-muted-foreground">对话即图表 · 多智能体数据洞察</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <input
              className="w-full rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none"
              placeholder="姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className="w-full rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none"
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none"
            type="password"
            placeholder="密码（至少 8 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full cursor-pointer rounded-lg bg-primary py-2 font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        <button
          className="mt-4 w-full cursor-pointer text-sm text-primary hover:underline"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
        </button>
      </div>
    </div>
  );
}
