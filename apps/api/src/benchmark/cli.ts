import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../app.module';
import { AgentService } from '../agent/agent.service';
import { runBenchmark } from './runner';

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq);
        const val = trimmed.slice(eq + 1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {
    // optional file
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const caseIds: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        if (key === 'id' || key === 'case') {
          caseIds.push(
            ...next
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          );
        } else {
          args[key] = next;
        }
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return { args, caseIds };
}

function printUsage() {
  console.log(`Usage: benchmark:run [options]

Options:
  --id, --case <ids>   Run only these case ids (comma-separated or repeatable)
  --filter <level>     Run only cases at this level (e.g. L1, L2)
  --limit <n>          Cap the number of cases
  --dataset <path>     Dataset yaml path
  --output <path>      Report output directory
  --model <name>       Override LLM_MODEL
  --datasource-id <id> Override BENCHMARK_DATASOURCE_ID
  --user-id <id>       Override BENCHMARK_USER_ID
  --session-id <id>    Override BENCHMARK_SESSION_ID

Examples:
  pnpm benchmark:run -- --id BI-L1-001
  pnpm benchmark:run -- --id BI-L1-001,BI-L1-002
  pnpm benchmark:run -- --id BI-L1-001 --id BI-L2-003
  pnpm benchmark:run -- --filter L1 --limit 5
`);
}

async function main() {
  const root = resolve(__dirname, '../../../../');
  loadEnvFile(resolve(root, '.env'));
  loadEnvFile(resolve(root, 'benchmark/.env.benchmark'));

  const { args, caseIds } = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printUsage();
    process.exit(0);
  }

  const dataSourceId =
    args['datasource-id'] ?? process.env.BENCHMARK_DATASOURCE_ID;
  const userId = args['user-id'] ?? process.env.BENCHMARK_USER_ID;
  const sessionId =
    args['session-id'] ?? process.env.BENCHMARK_SESSION_ID ?? 'benchmark-session-id';

  if (!dataSourceId || !userId) {
    console.error(
      'Missing BENCHMARK_DATASOURCE_ID / BENCHMARK_USER_ID. Run: pnpm benchmark:setup',
    );
    process.exit(1);
  }

  if (args.model) {
    process.env.LLM_MODEL = args.model;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const agentService = app.get(AgentService);

  const recommendation = await runBenchmark(agentService, {
    datasetPath:
      args.dataset ?? resolve(root, 'benchmark/datasets/gold-20.yaml'),
    dataSourceId,
    userId,
    sessionId,
    outputDir: args.output ?? resolve(root, 'benchmark/reports'),
    model: process.env.LLM_MODEL,
    levelFilter: args.filter,
    caseIds: caseIds.length ? caseIds : undefined,
    limit: args.limit ? parseInt(args.limit, 10) : undefined,
    dbHost: process.env.BENCHMARK_DB_HOST ?? 'localhost',
    dbPort: parseInt(process.env.BENCHMARK_DB_PORT ?? '5433', 10),
  });

  console.log(`\nRecommendation: ${recommendation}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
