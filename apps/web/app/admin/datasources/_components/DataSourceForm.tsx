'use client';

import { useState } from 'react';

interface FormValues {
  name: string;
  type: 'POSTGRESQL' | 'MYSQL';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  isReadOnly: boolean;
}

export function DataSourceForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>({
    name: '',
    type: 'POSTGRESQL',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    isReadOnly: true,
  });

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <form
      className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <label className="col-span-2 text-sm">
        <span className="mb-1 block text-slate-600">名称</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="如：生产数据库（只读）"
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">类型</span>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={values.type}
          onChange={(e) => {
            const type = e.target.value as FormValues['type'];
            set('type', type);
            set('port', type === 'MYSQL' ? 3306 : 5432);
          }}
        >
          <option value="POSTGRESQL">PostgreSQL</option>
          <option value="MYSQL">MySQL</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">数据库名</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={values.database}
          onChange={(e) => set('database', e.target.value)}
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">主机</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={values.host}
          onChange={(e) => set('host', e.target.value)}
          placeholder="db.example.com"
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">端口</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          type="number"
          value={values.port}
          onChange={(e) => set('port', parseInt(e.target.value, 10) || 0)}
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">用户名（建议只读账号）</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={values.username}
          onChange={(e) => set('username', e.target.value)}
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">密码（AES-256 加密存储）</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          type="password"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          required
        />
      </label>

      <div className="col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '测试连接中...' : '保存并测试连接'}
        </button>
      </div>
    </form>
  );
}
