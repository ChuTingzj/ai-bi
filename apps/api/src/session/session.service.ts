import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './session.dto';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { dataSource: { select: { name: true } } },
    });
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      dataSourceId: s.dataSourceId,
      dataSourceName: s.dataSource?.name,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  async create(userId: string, dto: CreateSessionDto) {
    const session = await this.prisma.session.create({
      data: {
        userId,
        title: dto.title ?? '新对话',
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
        chartConfig: m.chartConfig,
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
}
