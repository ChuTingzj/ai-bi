import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { QueryIntent, SseEvent } from '@ai-bi/shared';
import { isGuidanceMessageIntent } from '@ai-bi/shared';
import { Prisma } from '@ai-bi/db';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { DataSourceService } from '../datasource/datasource.service';
import { UserPayload } from '../common/current-user.decorator';
import { mapSandboxError } from '../sandbox/error-map';
import { validateSql } from '../sandbox/ffp-client';
import { LabRunDto } from './lab.dto';

interface SseMessage {
  data: string;
}

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly dataSourceService: DataSourceService,
  ) {}

  handleRun(dto: LabRunDto, user: UserPayload): Observable<SseMessage> {
    return new Observable<SseMessage>((subscriber) => {
      let aborted = false;
      const abortController = new AbortController();

      const emit = (event: SseEvent | '[DONE]') => {
        subscriber.next({
          data: typeof event === 'string' ? event : JSON.stringify(event),
        });
      };

      (async () => {
        const session = await this.sessionService.assertOwner(
          dto.sessionId,
          user.id,
        );
        const dataSourceId = dto.dataSourceId ?? session.dataSourceId;
        if (!dataSourceId) {
          throw new BadRequestException('请选择数据源后再运行 SQL');
        }
        await this.dataSourceService.findOne(user.id, dataSourceId);

        const validation = await validateSql(dto.sql);
        if (!validation.ok) {
          emit({
            type: 'error',
            code: '1001',
            message: mapSandboxError(validation.code, validation.reason),
          });
          emit({ type: 'done', messageId: dto.messageId ?? '' });
          emit('[DONE]');
          subscriber.complete();
          return;
        }

        let existing:
          | {
              id: string;
              intent: QueryIntent | null;
              chartConfig: Record<string, unknown> | null;
              content: string;
            }
          | undefined;
        let question = '自定义运行 SQL';

        if (dto.messageId) {
          const message = await this.prisma.message.findUnique({
            where: { id: dto.messageId },
          });
          if (!message || message.sessionId !== dto.sessionId) {
            throw new NotFoundException('消息不存在或不属于当前会话');
          }
          if (message.role !== 'ASSISTANT') {
            throw new BadRequestException('只能基于助手消息运行自定义 SQL');
          }
          const rawIntent = message.intent;
          existing = {
            id: message.id,
            intent:
              rawIntent && !isGuidanceMessageIntent(rawIntent)
                ? (rawIntent as unknown as QueryIntent)
                : null,
            chartConfig:
              (message.chartConfig as Record<string, unknown> | null) ?? null,
            content: message.content,
          };
          const previousUser = await this.prisma.message.findFirst({
            where: {
              sessionId: dto.sessionId,
              role: 'USER',
              createdAt: { lt: message.createdAt },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (previousUser?.content) question = previousUser.content;
        }

        emit({
          type: 'status',
          step: 'executing_sql',
          message: '正在校验 SQL...',
        });

        const generator = this.agentService.rerunFromSql({
          sql: dto.sql,
          dataSourceId,
          sessionId: dto.sessionId,
          question,
          intent: existing?.intent ?? null,
          signal: abortController.signal,
        });

        let result = await generator.next();
        while (!result.done) {
          if (aborted) return;
          emit(result.value);
          result = await generator.next();
        }

        const rerun = result.value;
        if (rerun.sqlError) {
          emit({ type: 'done', messageId: existing?.id ?? '' });
          emit('[DONE]');
          subscriber.complete();
          return;
        }

        const chartConfig = rerun.chartConfig ?? existing?.chartConfig ?? undefined;
        const content =
          rerun.analystText || existing?.content || '查询已执行，暂无业务洞察。';

        let messageId = existing?.id;
        if (existing) {
          await this.prisma.message.update({
            where: { id: existing.id },
            data: {
              sqlQuery: dto.sql,
              sqlEdited: true,
              ...(rerun.chartConfig
                ? { chartConfig: rerun.chartConfig as Prisma.InputJsonValue }
                : {}),
              ...(rerun.analystText ? { content: rerun.analystText } : {}),
            },
          });
        } else {
          await this.prisma.message.create({
            data: {
              sessionId: dto.sessionId,
              role: 'USER',
              content: '自定义运行 SQL',
            },
          });
          const assistant = await this.prisma.message.create({
            data: {
              sessionId: dto.sessionId,
              role: 'ASSISTANT',
              content,
              sqlQuery: dto.sql,
              sqlEdited: true,
              chartConfig: chartConfig as Prisma.InputJsonValue | undefined,
            },
          });
          messageId = assistant.id;
        }

        emit({ type: 'done', messageId: messageId ?? '' });
        emit('[DONE]');
        subscriber.complete();
      })().catch((err) => {
        if (aborted || (err as Error).name === 'AbortError') {
          if (!subscriber.closed) subscriber.complete();
          return;
        }
        this.logger.error(`Lab run failed: ${err.message}`);
        emit({
          type: 'error',
          code: '500',
          message: err.message ?? '服务器内部错误',
        });
        emit('[DONE]');
        subscriber.complete();
      });

      return () => {
        aborted = true;
        abortController.abort();
      };
    });
  }
}
