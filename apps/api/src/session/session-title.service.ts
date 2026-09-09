import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  DEFAULT_SESSION_TITLE,
  heuristicTitle,
  sanitizeTitle,
} from '@ai-bi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../agent/llm.service';
import { TITLE_SYSTEM_PROMPT } from '../agent/graph/prompts';
import { withLlmRetry } from '../agent/llm-retry';

const TITLE_LLM_TIMEOUT_MS = 8_000;
const DEFAULT_TITLE_LLM_MODEL = '~deepseek/deepseek-v4-flash-latest';

@Injectable()
export class SessionTitleService {
  private readonly logger = new Logger(SessionTitleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Rename a session from its first user message when the title is still the default.
   * Returns the persisted title, or null if nothing was written.
   */
  async maybeRename(sessionId: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { title: true },
    });
    if (!session || session.title !== DEFAULT_SESSION_TITLE) return null;

    const firstUser = await this.prisma.message.findFirst({
      where: { sessionId, role: 'USER' },
      orderBy: { createdAt: 'asc' },
      select: { content: true },
    });
    if (!firstUser?.content.trim()) return null;

    const question = firstUser.content;
    let title: string;
    try {
      title = await this.generateTitle(question);
    } catch (err) {
      this.logger.warn(
        `Title LLM failed for session ${sessionId}: ${(err as Error).message}`,
      );
      title = heuristicTitle(question);
    }

    if (!title || title === DEFAULT_SESSION_TITLE) {
      title = heuristicTitle(question);
    }

    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, title: DEFAULT_SESSION_TITLE },
      data: { title },
    });
    if (updated.count === 0) return null;
    return title;
  }

  private async generateTitle(question: string): Promise<string> {
    const response = await withLlmRetry(async () => {
      const model = this.llm.create({
        model: process.env.LLM_TITLE_MODEL ?? DEFAULT_TITLE_LLM_MODEL,
        timeout: TITLE_LLM_TIMEOUT_MS,
        maxTokens: 32,
      });
      return model.invoke([
        new SystemMessage(TITLE_SYSTEM_PROMPT),
        new HumanMessage(question.slice(0, 500)),
      ]);
    });
    return sanitizeTitle(String(response.content ?? ''), question);
  }
}
