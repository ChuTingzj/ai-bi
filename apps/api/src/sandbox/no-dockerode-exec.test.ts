import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const srcRoot = path.resolve(__dirname, '..');
const pingAllowlist = path.normalize('sandbox/docker-ping.ts');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('production dockerode / password-Env guards', () => {
  it('only docker-ping.ts may import dockerode', () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const rel = path.relative(srcRoot, file);
      if (path.normalize(rel) === pingAllowlist) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      if (
        /from ['"]dockerode['"]/.test(text) ||
        /require\(['"]dockerode['"]\)/.test(text)
      ) {
        offenders.push(rel);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('sandbox adapter must not put the password in container Env', () => {
    const service = readFileSync(
      path.join(srcRoot, 'sandbox', 'sandbox.service.ts'),
      'utf8',
    );
    assert.equal(/DB_PASS/.test(service), false);
    assert.equal(/PGPASSWORD/.test(service), false);
    assert.equal(/createContainer/.test(service), false);
    assert.equal(/\bEnv\s*:/.test(service), false);
  });

  it('loads ffp-sql-sandbox via dynamic import, not require()', () => {
    const client = readFileSync(
      path.join(srcRoot, 'sandbox', 'ffp-client.ts'),
      'utf8',
    );
    assert.equal(/require\(['"]ffp-sql-sandbox['"]\)/.test(client), false);
    assert.match(client, /return import\(specifier\)/);
  });
});
