import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatUserFacingLlmError,
  isTransientLlmError,
  withLlmRetry,
} from './llm-retry';

describe('isTransientLlmError', () => {
  it('detects OpenRouter mid-stream SSE injection', () => {
    assert.equal(
      isTransientLlmError(
        new Error('JSON error injected into SSE stream'),
      ),
      true,
    );
  });

  it('detects numeric provider status codes in message', () => {
    assert.equal(
      isTransientLlmError(new Error('{"code":502,"message":"Bad Gateway"}')),
      true,
    );
    assert.equal(
      isTransientLlmError(new Error('Request failed with status 503')),
      true,
    );
  });

  it('detects status/code fields on error objects', () => {
    const err = Object.assign(new Error('provider down'), { status: 502 });
    assert.equal(isTransientLlmError(err), true);
    const typed = Object.assign(new Error('unavailable'), {
      error: { metadata: { error_type: 'provider_unavailable' } },
    });
    assert.equal(isTransientLlmError(typed), true);
  });

  it('rejects auth and validation failures', () => {
    assert.equal(isTransientLlmError(new Error('Invalid API key')), false);
    const auth = Object.assign(new Error('Unauthorized'), { status: 401 });
    assert.equal(isTransientLlmError(auth), false);
  });
});

describe('withLlmRetry', () => {
  it('retries transient failures then succeeds', async () => {
    let attempts = 0;
    const result = await withLlmRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('JSON error injected into SSE stream');
        }
        return 'ok';
      },
      { retries: 3, baseDelayMs: 1 },
    );
    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
  });

  it('does not retry non-transient errors', async () => {
    let attempts = 0;
    await assert.rejects(
      () =>
        withLlmRetry(
          async () => {
            attempts += 1;
            throw new Error('Invalid API key');
          },
          { retries: 3, baseDelayMs: 1 },
        ),
      /Invalid API key/,
    );
    assert.equal(attempts, 1);
  });
});

describe('formatUserFacingLlmError', () => {
  it('maps OpenRouter mid-stream errors to a Chinese retry hint', () => {
    const message = formatUserFacingLlmError(
      new Error('JSON error injected into SSE stream'),
    );
    assert.match(message, /模型服务/);
    assert.match(message, /重试/);
  });
});
