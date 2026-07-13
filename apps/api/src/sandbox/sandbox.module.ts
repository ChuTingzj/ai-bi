import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { CryptoService } from '../common/crypto.service';

@Module({
  providers: [SandboxService, CryptoService],
  exports: [SandboxService],
})
export class SandboxModule {}
