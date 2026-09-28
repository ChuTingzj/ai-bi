import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  GUIDANCE_TEMPLATE_REPO_PATH,
  GUIDANCE_TEMPLATE_VERSION,
} from './pinned';
import type { LoadedGuidance } from './types';

export const GUIDANCE_TEMPLATE_FILE = resolve(__dirname, 'templates/intent-aggregation-grain-v1.md');

const VERSION_LINE = /^version:\s*(\S+)\s*$/m;

export function loadGuidanceTemplate(
  filePath: string = GUIDANCE_TEMPLATE_FILE,
): LoadedGuidance {
  const body = readFileSync(filePath, 'utf8');
  const version = VERSION_LINE.exec(body)?.[1];
  if (version !== GUIDANCE_TEMPLATE_VERSION) {
    throw new Error(
      `Guidance template version must be ${GUIDANCE_TEMPLATE_VERSION}. Found ${version ?? 'none'}.`,
    );
  }
  const sha256 = createHash('sha256').update(body).digest('hex');
  const checksumPath = `${filePath}.sha256`;
  const expected = readFileSync(checksumPath, 'utf8').trim();
  if (sha256 !== expected) {
    throw new Error(
      `Guidance template checksum mismatch for ${GUIDANCE_TEMPLATE_REPO_PATH}. ` +
        `File sha256 ${sha256} does not match ${checksumPath}. ` +
        'Bump the version and checksum together. Do not edit the template mid-run.',
    );
  }
  return {
    version,
    path: GUIDANCE_TEMPLATE_REPO_PATH,
    sha256,
    body,
  };
}
