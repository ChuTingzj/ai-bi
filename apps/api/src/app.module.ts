import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SessionModule } from './session/session.module';
import { ChatModule } from './chat/chat.module';
import { AgentModule } from './agent/agent.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { DataSourceModule } from './datasource/datasource.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LabModule } from './lab/lab.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UserModule,
    SessionModule,
    ChatModule,
    AgentModule,
    SandboxModule,
    DataSourceModule,
    DashboardModule,
    LabModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
