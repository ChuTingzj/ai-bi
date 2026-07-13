import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AgentModule } from '../agent/agent.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [AgentModule, SessionModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
