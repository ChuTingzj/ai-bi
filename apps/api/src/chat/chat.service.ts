import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { SessionTitleService } from '../session/session-title.service';
import { UserPayload } from '../common/current-user.decorator';
import { ChatStreamDto } from './chat.dto';
import { DEFAULT_SESSION_TITLE, type QueryIntent, type SseEvent } from '@ai-bi/shared';

interface SseMessage {
  data: string;
}

const TITLE_EMIT_WAIT_MS = 8_000;

function waitWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly sessionTitleService: SessionTitleService,
  ) {}

  handleStream(dto: ChatStreamDto, user: UserPayload): Observable<SseMessage> {
    return new Observable<SseMessage>((subscriber) => {
      let aborted = false;
      const abortController = new AbortController();

      const emit = (event: SseEvent | '[DONE]') => {
        if (aborted || subscriber.closed) return;
        subscriber.next({
          data: event === '[DONE]' ? '[DONE]' : JSON.stringify(event),
        });
      };

      (async () => {
        const session = await this.sessionService.assertOwner(
          dto.sessionId,
          user.id,
        );
        const dataSourceId = session.dataSourceId ?? dto.dataSourceId;
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

        let titleEmitted = false;
        const emitTitle = (title: string) => {
          if (!title || titleEmitted) return;
          titleEmitted = true;
          emit({ type: 'title', title });
        };

        const titlePromise =
          session.title === DEFAULT_SESSION_TITLE
            ? this.sessionTitleService.maybeRename(dto.sessionId)
            : null;
        titlePromise?.then(
          (title) => {
            if (title) emitTitle(title);
          },
          (err: Error) => {
            this.logger.warn(`Session title rename failed: ${err.message}`);
          },
        );

        emit({
          type: 'status',
          step: 'planning',
          message: '正在理解您的问题...',
        });

        let fullContent = '';
        let chartConfig: Record<string, unknown> | null = null;
        let sqlQuery: string | null = null;
        let intent: QueryIntent | null = null;

        const generator = this.agentService.invokeWorkflow({
          sessionId: dto.sessionId,
          question: dto.message,
          dataSourceId,
          userId: user.id,
          signal: abortController.signal,
        });

        for await (const event of generator) {
          if (aborted) return;
          emit(event);

          if (event.type === 'token') fullContent += event.content;
          if (event.type === 'chart') chartConfig = event.config;
          if (event.type === 'intent') intent = event.intent;
          if (event.type === 'sql' && event.status === 'generated')
            sqlQuery = event.query;
          if (event.type === 'error') fullContent = fullContent || event.message;
        }

        if (aborted) return;

        const message = await this.prisma.message.create({
          data: {
            sessionId: dto.sessionId,
            role: 'ASSISTANT',
            content: fullContent,
            chartConfig: (chartConfig ?? undefined) as object | undefined,
            sqlQuery: sqlQuery ?? undefined,
            intent: (intent ?? undefined) as object | undefined,
          },
        });

        if (titlePromise && !titleEmitted) {
          const title = await waitWithTimeout(titlePromise, TITLE_EMIT_WAIT_MS);
          if (title) emitTitle(title);
        }

        emit({ type: 'done', messageId: message.id });
        emit('[DONE]');
        if (!subscriber.closed) subscriber.complete();
      })().catch((err) => {
        if (aborted || (err as Error).name === 'AbortError') {
          if (!subscriber.closed) subscriber.complete();
          return;
        }
        this.logger.error(`Chat stream failed: ${err.message}`);
        emit({
          type: 'error',
          code: '500',
          message: err.message ?? '服务器内部错误',
        });
        emit('[DONE]');
        if (!subscriber.closed) subscriber.complete();
      });

      return () => {
        aborted = true;
        abortController.abort();
      };
    });
  }
}
