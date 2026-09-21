import { Module } from '@nestjs/common';
import { CryptoService } from '../common/crypto.service';
import { pingDockerDaemon } from './docker-ping';
import { executeSql } from './ffp-client';
import {
  SANDBOX_DOCKER_PING,
  SANDBOX_EXECUTE_SQL,
  SandboxService,
} from './sandbox.service';

@Module({
  providers: [
    CryptoService,
    { provide: SANDBOX_EXECUTE_SQL, useValue: executeSql },
    { provide: SANDBOX_DOCKER_PING, useValue: pingDockerDaemon },
    SandboxService,
  ],
  exports: [SandboxService],
})
export class SandboxModule {}
