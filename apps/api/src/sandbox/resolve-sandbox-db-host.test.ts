import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSandboxDbHost } from './sandbox.service';

describe('resolveSandboxDbHost', () => {
  it('rewrites loopback hosts so the sandbox container can reach the host', () => {
    assert.equal(resolveSandboxDbHost('localhost'), 'host.docker.internal');
    assert.equal(resolveSandboxDbHost('127.0.0.1'), 'host.docker.internal');
    assert.equal(resolveSandboxDbHost('::1'), 'host.docker.internal');
    assert.equal(resolveSandboxDbHost('0.0.0.0'), 'host.docker.internal');
    assert.equal(resolveSandboxDbHost('  LocalHost  '), 'host.docker.internal');
  });

  it('leaves remote hosts unchanged', () => {
    assert.equal(resolveSandboxDbHost('db.internal'), 'db.internal');
    assert.equal(resolveSandboxDbHost('10.0.0.8'), '10.0.0.8');
    assert.equal(resolveSandboxDbHost('postgres'), 'postgres');
  });
});
