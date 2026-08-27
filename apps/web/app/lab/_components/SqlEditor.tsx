'use client';

import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';

export function SqlEditor({
  value,
  onChange,
  onRun,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  disabled: boolean;
}) {
  const runKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          if (!disabled) onRun();
          return true;
        },
      },
    ]),
  );

  return (
    <div className="min-h-[240px] flex-1 overflow-hidden border-b border-border lg:min-h-[240px]">
      <CodeMirror
        value={value}
        height="240px"
        theme="light"
        editable={!disabled}
        extensions={[sql(), runKeymap]}
        onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
        className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-editor]:font-mono [&_.cm-scroller]:font-mono"
      />
    </div>
  );
}
