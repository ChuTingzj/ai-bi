import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { LlmService } from './llm.service';
import { SandboxModule } from '../sandbox/sandbox.module';

@Module({
  imports: [SandboxModule],
  providers: [AgentService, LlmService],
  exports: [AgentService],
})
export class AgentModule {}
