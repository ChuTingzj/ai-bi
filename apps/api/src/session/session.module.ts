import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SessionTitleService } from './session-title.service';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  controllers: [SessionController],
  providers: [SessionService, SessionTitleService],
  exports: [SessionService, SessionTitleService],
})
export class SessionModule {}
