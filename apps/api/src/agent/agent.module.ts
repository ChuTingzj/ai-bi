import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { LlmService } from './llm.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [SandboxModule, PrismaModule],
  providers: [AgentService, LlmService],
  exports: [AgentService, LlmService],
})
export class AgentModule {}
