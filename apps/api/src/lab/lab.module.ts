import { Module } from '@nestjs/common';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';
import { AgentModule } from '../agent/agent.module';
import { SessionModule } from '../session/session.module';
import { DataSourceModule } from '../datasource/datasource.module';

@Module({
  imports: [AgentModule, SessionModule, DataSourceModule],
  controllers: [LabController],
  providers: [LabService],
})
export class LabModule {}
