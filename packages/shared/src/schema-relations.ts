import type {
  GuidanceJoin,
  GuidancePayload,
  SchemaRelationMeta,
  SchemaTableMeta,
} from './guidance-types';
import { parseSchemaDoc } from './schema-parse';

export type RelatedTableCandidate = {
  table: string;
  relation: SchemaRelationMeta;
  /** e.g. `user_id → users.id` or `orders.user_id → id` when edge is inbound. */
  hint: string;
};

export function collectRelations(
  tables: SchemaTableMeta[],
): SchemaRelationMeta[] {
  const out: SchemaRelationMeta[] = [];
  for (const table of tables) {
    for (const rel of table.outgoingRelations ?? []) {
      out.push(rel);
    }
  }
  return out;
}

function eqName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function formatHint(relation: SchemaRelationMeta, towardOther: boolean): string {
  const from = relation.fromColumns.join(', ');
  const to = relation.toColumns.join(', ');
  if (towardOther) {
    // Primary holds FK → other: show from cols → other.table.toCols
    return `${from} → ${relation.toTable}.${to}`;
  }
  // Other holds FK → primary: show other.fromCols → primary.toCols (on primary)
  return `${relation.fromTable}.${from} → ${to}`;
}

/**
 * Direct FK neighbors of `primary` (either direction). No multi-hop.
 */
export function relatedTablesFor(
  tables: SchemaTableMeta[],
  primary: string,
): RelatedTableCandidate[] {
  const relations = collectRelations(tables);
  const seen = new Set<string>();
  const candidates: RelatedTableCandidate[] = [];

  for (const relation of relations) {
    if (eqName(relation.fromTable, primary) && !eqName(relation.toTable, primary)) {
      const key = relation.toTable.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        table: relation.toTable,
        relation,
        hint: formatHint(relation, true),
      });
      continue;
    }
    if (eqName(relation.toTable, primary) && !eqName(relation.fromTable, primary)) {
      const key = relation.fromTable.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        table: relation.fromTable,
        relation,
        hint: formatHint(relation, false),
      });
    }
  }

  return candidates;
}

function findDirectRelation(
  relations: SchemaRelationMeta[],
  primary: string,
  related: string,
): SchemaRelationMeta | null {
  for (const relation of relations) {
    const aToB =
      eqName(relation.fromTable, primary) && eqName(relation.toTable, related);
    const bToA =
      eqName(relation.fromTable, related) && eqName(relation.toTable, primary);
    if (aToB || bToA) return relation;
  }
  return null;
}

function relationToJoin(relation: SchemaRelationMeta): GuidanceJoin {
  return {
    leftTable: relation.fromTable,
    leftColumns: [...relation.fromColumns],
    rightTable: relation.toTable,
    rightColumns: [...relation.toColumns],
    type: 'INNER',
  };
}

/**
 * Build INNER joins for related tables that have a direct FK edge to primary.
 * Skips related names with no direct edge (does not throw).
 */
export function buildJoins(
  primary: string,
  related: string[],
  tables: SchemaTableMeta[],
): GuidanceJoin[] {
  const relations = collectRelations(tables);
  const joins: GuidanceJoin[] = [];
  for (const name of related) {
    if (eqName(name, primary)) continue;
    const relation = findDirectRelation(relations, primary, name);
    if (!relation) continue;
    joins.push(relationToJoin(relation));
  }
  return joins;
}

function joinMatchesRelation(
  join: GuidanceJoin,
  relation: SchemaRelationMeta,
): boolean {
  if (join.type !== 'INNER') return false;
  const sameDirection =
    eqName(join.leftTable, relation.fromTable) &&
    eqName(join.rightTable, relation.toTable) &&
    columnsEqual(join.leftColumns, relation.fromColumns) &&
    columnsEqual(join.rightColumns, relation.toColumns);
  const flipped =
    eqName(join.leftTable, relation.toTable) &&
    eqName(join.rightTable, relation.fromTable) &&
    columnsEqual(join.leftColumns, relation.toColumns) &&
    columnsEqual(join.rightColumns, relation.fromColumns);
  return sameDirection || flipped;
}

function columnsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((col, i) => eqName(col, b[i]));
}

export type GuidanceValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate guidance payload against schemaDoc FK graph.
 */
export function validateGuidanceAgainstSchema(
  schemaDoc: string,
  payload: GuidancePayload,
): GuidanceValidationResult {
  const tables = parseSchemaDoc(schemaDoc);
  if (!payload.tables.length) {
    return { ok: false, error: '引导约束缺少主表' };
  }

  const primary = payload.tables[0];
  const known = new Map(tables.map((t) => [t.name.toLowerCase(), t.name]));
  if (!known.has(primary.toLowerCase())) {
    return { ok: false, error: `主表不存在：${primary}` };
  }

  const neighbors = new Set(
    relatedTablesFor(tables, primary).map((c) => c.table.toLowerCase()),
  );
  const related = payload.tables.slice(1);
  for (const name of related) {
    if (!neighbors.has(name.toLowerCase())) {
      return {
        ok: false,
        error: `表 ${name} 与主表 ${primary} 无直接外键关联`,
      };
    }
  }

  const joins = payload.joins ?? [];
  if (related.length === 0) {
    if (joins.length > 0) {
      return { ok: false, error: '单表查询不应包含关联条件' };
    }
    return { ok: true };
  }

  const relations = collectRelations(tables);
  for (const join of joins) {
    const matched = relations.some((rel) => joinMatchesRelation(join, rel));
    if (!matched) {
      return {
        ok: false,
        error: `无效的关联：${join.leftTable} → ${join.rightTable}`,
      };
    }
  }

  // Every related table must have a matching join edge
  for (const name of related) {
    const hasJoin = joins.some((j) => {
      const touches =
        (eqName(j.leftTable, primary) && eqName(j.rightTable, name)) ||
        (eqName(j.rightTable, primary) && eqName(j.leftTable, name)) ||
        (eqName(j.leftTable, name) && eqName(j.rightTable, primary)) ||
        (eqName(j.rightTable, name) && eqName(j.leftTable, primary));
      return touches;
    });
    if (!hasJoin) {
      return { ok: false, error: `缺少与表 ${name} 的关联条件` };
    }
  }

  return { ok: true };
}
