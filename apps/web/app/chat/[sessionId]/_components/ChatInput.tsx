'use client';

import { useState } from 'react';

export function ChatInput({
  disabled,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  placeholder: string;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = useState('');

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          className="max-h-32 flex-1 resize-none rounded-xl border border-border px-4 py-2.5 focus:border-primary focus:outline-none disabled:bg-muted"
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="min-h-11 cursor-pointer rounded-xl bg-primary px-5 py-2.5 font-medium text-on-primary transition-colors hover:opacity-90 disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
}
