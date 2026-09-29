import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sqlGuidanceEnabledFromEnv } from './sql-guidance';

describe('sqlGuidanceEnabledFromEnv', () => {
  it('defaults on when unset or blank', () => {
    assert.equal(sqlGuidanceEnabledFromEnv({}), true);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: '' }), true);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: '  ' }), true);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: 'yes' }), true);
  });

  it('is on for true and 1', () => {
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: 'true' }), true);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: 'TRUE' }), true);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: '1' }), true);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: ' 1 ' }), true);
  });

  it('is off for false, 0, and off', () => {
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: 'false' }), false);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: 'FALSE' }), false);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: '0' }), false);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: 'off' }), false);
    assert.equal(sqlGuidanceEnabledFromEnv({ SQL_GUIDANCE_ENABLED: ' OFF ' }), false);
  });
});
