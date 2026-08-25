import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { UserPayload } from '../common/current-user.decorator';
import { ChatStreamDto } from './chat.dto';

interface SseMessage {
  data: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  handleStream(dto: ChatStreamDto, user: UserPayload): Observable<SseMessage> {
    return new Observable<SseMessage>((subscriber) => {
      let aborted = false;
      const abortController = new AbortController();

      (async () => {
        const session = await this.sessionService.assertOwner(
          dto.sessionId,
          user.id,
        );
        const dataSourceId = dto.dataSourceId ?? session.dataSourceId;
        if (!dataSourceId) {
          throw new BadRequestException('会话未绑定数据源，请指定 dataSourceId');
        }

        await this.prisma.message.create({
          data: {
            sessionId: dto.sessionId,
            role: 'USER',
            content: dto.message,
          },
        });

        subscriber.next({
          data: JSON.stringify({
            type: 'status',
            step: 'planning',
            message: '正在理解您的问题...',
          }),
        });

        let fullContent = '';
        let chartConfig: Record<string, unknown> | null = null;
        let sqlQuery: string | null = null;

        const generator = this.agentService.invokeWorkflow({
          sessionId: dto.sessionId,
          question: dto.message,
          dataSourceId,
          userId: user.id,
          signal: abortController.signal,
        });

        for await (const event of generator) {
          if (aborted) return;
          subscriber.next({ data: JSON.stringify(event) });

          if (event.type === 'token') fullContent += event.content;
          if (event.type === 'chart') chartConfig = event.config;
          if (event.type === 'sql' && event.status === 'generated')
            sqlQuery = event.query;
          if (event.type === 'error') fullContent = fullContent || event.message;
        }

        const message = await this.prisma.message.create({
          data: {
            sessionId: dto.sessionId,
            role: 'ASSISTANT',
            content: fullContent,
            chartConfig: (chartConfig ?? undefined) as object | undefined,
            sqlQuery: sqlQuery ?? undefined,
          },
        });

        subscriber.next({
          data: JSON.stringify({ type: 'done', messageId: message.id }),
        });
        subscriber.next({ data: '[DONE]' });
        subscriber.complete();
      })().catch((err) => {
        if (aborted || (err as Error).name === 'AbortError') {
          if (!subscriber.closed) subscriber.complete();
          return;
        }
        this.logger.error(`Chat stream failed: ${err.message}`);
        subscriber.next({
          data: JSON.stringify({
            type: 'error',
            code: '500',
            message: err.message ?? '服务器内部错误',
          }),
        });
        subscriber.next({ data: '[DONE]' });
        subscriber.complete();
      });

      return () => {
        aborted = true;
        abortController.abort();
      };
    });
  }
}
