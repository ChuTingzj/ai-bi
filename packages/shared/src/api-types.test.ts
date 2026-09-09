import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../src/api-types';

describe('ErrorCode', () => {
  it('keeps the public numeric contract used by SSE and HTTP clients', () => {
    assert.equal(ErrorCode.SUCCESS, 0);
    assert.equal(ErrorCode.UNAUTHORIZED, 401);
    assert.equal(ErrorCode.FORBIDDEN, 403);
    assert.equal(ErrorCode.NOT_FOUND, 404);
    assert.equal(ErrorCode.VALIDATION_ERROR, 422);
    assert.equal(ErrorCode.RATE_LIMITED, 429);
    assert.equal(ErrorCode.INTERNAL_ERROR, 500);
    assert.equal(ErrorCode.SQL_SANDBOX_ERROR, 1001);
    assert.equal(ErrorCode.DATASOURCE_CONNECTION_FAILED, 1002);
    assert.equal(ErrorCode.AGENT_MAX_RETRY_EXCEEDED, 1003);
    assert.equal(ErrorCode.CHART_GENERATION_FAILED, 1004);
    assert.equal(ErrorCode.GUIDANCE_INTENT_FAILED, 1005);
  });
});
