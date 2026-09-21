import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pingDockerDaemon } from './docker-ping';

describe('pingDockerDaemon', () => {
  it('returns true when Docker ping resolves', async () => {
    assert.equal(await pingDockerDaemon({ ping: async () => 'OK' }), true);
  });

  it('returns false when Docker ping rejects (daemon down)', async () => {
    assert.equal(
      await pingDockerDaemon({
        ping: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
      false,
    );
  });
});
