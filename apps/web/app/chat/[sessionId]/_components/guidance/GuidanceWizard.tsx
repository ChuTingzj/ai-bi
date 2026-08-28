'use client';

import { useState } from 'react';
import type {
  GuidanceFilter,
  GuidanceMessageIntent,
  GuidancePayload,
} from '@ai-bi/shared';
import { TableStep } from './TableStep';
import { FieldStep } from './FieldStep';
import { FilterStep } from './FilterStep';
import { buildGuidanceMessage } from './guidance-summary';

const STEPS = [
  { id: 'table', label: '表' },
  { id: 'fields', label: '字段' },
  { id: 'filters', label: '过滤' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export function GuidanceWizard({
  intent,
  disabled,
  onSubmit,
}: {
  intent: GuidanceMessageIntent;
  disabled?: boolean;
  onSubmit: (message: string, guidance: GuidancePayload) => void;
}) {
  const [step, setStep] = useState<StepId>('table');
  const [table, setTable] = useState<string | null>(
    intent.selection?.tables[0] ?? null,
  );
  const [fields, setFields] = useState<string[]>(intent.selection?.fields ?? []);
  const [filters, setFilters] = useState<GuidanceFilter[]>(
    intent.selection?.filters ?? [],
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function goNext() {
    if (step === 'table' && table) setStep('fields');
    else if (step === 'fields') setStep('filters');
  }

  function goBack() {
    if (step === 'fields') setStep('table');
    else if (step === 'filters') setStep('fields');
  }

  function handleSubmit() {
    if (!table || disabled) return;
    const payload: GuidancePayload = {
      tables: [table],
      fields,
      filters: filters.filter((f) => f.field),
    };
    onSubmit(buildGuidanceMessage(intent.originalQuestion, payload), payload);
  }

  const canNext =
    (step === 'table' && !!table) || step === 'fields' || step === 'filters';

  return (
    <div className="mt-3 space-y-4">
      <nav aria-label="引导步骤进度" className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const done = i < stepIndex;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!done && !active}
              onClick={() => done && setStep(s.id)}
              className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 disabled:cursor-default ${
                active
                  ? 'bg-primary text-on-primary'
                  : done
                    ? 'text-primary hover:bg-muted'
                    : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] font-medium ${
                  active
                    ? 'bg-on-primary/20'
                    : done
                      ? 'bg-primary/10'
                      : 'bg-muted'
                }`}
              >
                {i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
        <span className="ml-auto text-muted-foreground">
          第 {stepIndex + 1} 步 / 共 3 步
        </span>
      </nav>

      <div
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        key={step}
      >
        {step === 'table' && (
          <>
            <h3 className="mb-2 text-sm font-medium text-foreground">
              选择要查询的表
            </h3>
            <TableStep
              tables={intent.tables}
              selected={table}
              onSelect={(name) => {
                setTable(name);
                setFields([]);
                setFilters([]);
              }}
            />
          </>
        )}
        {step === 'fields' && table && (
          <>
            <h3 className="mb-2 text-sm font-medium text-foreground">
              选择需要的字段（可多选）
            </h3>
            <FieldStep
              tables={intent.tables}
              selectedTable={table}
              selectedFields={fields}
              onChange={setFields}
            />
          </>
        )}
        {step === 'filters' && table && (
          <>
            <h3 className="mb-2 text-sm font-medium text-foreground">
              添加过滤条件（可选）
            </h3>
            <FilterStep
              tables={intent.tables}
              selectedTable={table}
              selectedFields={fields}
              filters={filters}
              onChange={setFilters}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        {step !== 'table' && (
          <button
            type="button"
            onClick={goBack}
            disabled={disabled}
            className="min-h-11 cursor-pointer rounded-lg px-4 text-sm text-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-50"
          >
            上一步
          </button>
        )}
        {step !== 'filters' ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext || disabled || (step === 'table' && !table)}
            className="min-h-11 cursor-pointer rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一步
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!table || disabled}
            className="min-h-11 cursor-pointer rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            开始查询
          </button>
        )}
      </div>
    </div>
  );
}

export function GuidanceSummaryReadonly({
  intent,
}: {
  intent: GuidanceMessageIntent;
}) {
  const selection = intent.selection;
  if (!selection) return null;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      <p className="text-xs font-medium text-muted-foreground">已补充的查询范围</p>
      <div className="chip-list flex flex-wrap gap-1.5">
        {selection.tables.map((t) => (
          <span
            key={t}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
          >
            表 {t}
          </span>
        ))}
        {selection.fields.map((f) => (
          <span
            key={f}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
          >
            {f}
          </span>
        ))}
        {selection.filters.map((f, i) => (
          <span
            key={`${f.field}-${i}`}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
          >
            {f.field} {f.operator}
            {f.value ? ` ${f.value}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
