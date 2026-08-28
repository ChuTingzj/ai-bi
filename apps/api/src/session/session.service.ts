import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_SESSION_TITLE,
  type MessageIntent,
} from '@ai-bi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto, UpdateSessionDto } from './session.dto';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { dataSource: { select: { name: true } } },
    });
    return sessions.map((s) => this.toDto(s));
  }

  async create(userId: string, dto: CreateSessionDto) {
    const session = await this.prisma.session.create({
      data: {
        userId,
        title: dto.title ?? DEFAULT_SESSION_TITLE,
        dataSourceId: dto.dataSourceId,
      },
    });
    return {
      id: session.id,
      title: session.title,
      dataSourceId: session.dataSourceId,
      createdAt: session.createdAt.toISOString(),
    };
  }

  async update(sessionId: string, userId: string, dto: UpdateSessionDto) {
    await this.assertOwner(sessionId, userId);
    const dataSource = await this.prisma.dataSource.findFirst({
      where: { id: dto.dataSourceId, userId },
      select: { id: true },
    });
    if (!dataSource) throw new NotFoundException('数据源不存在');

    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { dataSourceId: dto.dataSourceId },
      include: { dataSource: { select: { name: true } } },
    });
    return this.toDto(session);
  }

  async assertOwner(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.userId !== userId) throw new ForbiddenException('无权访问该会话');
    return session;
  }

  async messages(sessionId: string, userId: string, page = 1, limit = 50) {
    await this.assertOwner(sessionId, userId);
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.message.count({ where: { sessionId } }),
    ]);
    return {
      items: items.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sqlQuery: m.sqlQuery,
        intent: (m.intent as MessageIntent | null) ?? null,
        sqlEdited: m.sqlEdited,
        chartConfig: (m.chartConfig as Record<string, unknown> | null) ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  async remove(sessionId: string, userId: string) {
    await this.assertOwner(sessionId, userId);
    await this.prisma.session.delete({ where: { id: sessionId } });
    return { deleted: true };
  }

  private toDto(session: {
    id: string;
    title: string;
    dataSourceId: string | null;
    createdAt: Date;
    updatedAt: Date;
    dataSource?: { name: string } | null;
  }) {
    return {
      id: session.id,
      title: session.title,
      dataSourceId: session.dataSourceId,
      dataSourceName: session.dataSource?.name,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
