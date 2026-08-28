export type GuidanceFilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'IN'
  | 'IS NULL'
  | 'IS NOT NULL';

export interface SchemaColumnMeta {
  name: string;
  type?: string;
}

export interface SchemaTableMeta {
  name: string;
  columns: SchemaColumnMeta[];
}

export interface GuidanceFilter {
  field: string;
  operator: GuidanceFilterOperator;
  value?: string;
}

export interface GuidancePayload {
  tables: string[];
  fields: string[];
  filters: GuidanceFilter[];
}

/** Persisted on ASSISTANT messages when the graph enters guidance mode */
export interface GuidanceMessageIntent {
  kind: 'guidance';
  originalQuestion: string;
  tables: SchemaTableMeta[];
  /** Set after the user completes the wizard and resubmits */
  completed?: boolean;
  selection?: GuidancePayload;
}

export function isGuidanceMessageIntent(
  value: unknown,
): value is GuidanceMessageIntent {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as GuidanceMessageIntent).kind === 'guidance'
  );
}
