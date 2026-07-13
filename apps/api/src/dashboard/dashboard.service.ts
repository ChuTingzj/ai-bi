import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDashboardChartDto, UpdateChartPositionDto } from './dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const charts = await this.prisma.dashboardChart.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return charts.map((c) => ({
      id: c.id,
      title: c.title,
      chartConfig: c.chartConfig,
      sourceMessageId: c.sourceMessageId,
      position: c.position,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async create(userId: string, dto: CreateDashboardChartDto) {
    const chart = await this.prisma.dashboardChart.create({
      data: {
        userId,
        title: dto.title,
        chartConfig: dto.chartConfig as object,
        sourceMessageId: dto.sourceMessageId,
        position: (dto.position ?? { x: 0, y: 0, w: 6, h: 4 }) as object,
      },
    });
    return {
      id: chart.id,
      title: chart.title,
      createdAt: chart.createdAt.toISOString(),
    };
  }

  async updatePosition(userId: string, id: string, dto: UpdateChartPositionDto) {
    await this.assertOwner(id, userId);
    await this.prisma.dashboardChart.update({
      where: { id },
      data: { position: dto.position as object },
    });
    return { updated: true };
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(id, userId);
    await this.prisma.dashboardChart.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwner(id: string, userId: string) {
    const chart = await this.prisma.dashboardChart.findUnique({
      where: { id },
    });
    if (!chart) throw new NotFoundException('图表不存在');
    if (chart.userId !== userId) throw new ForbiddenException('无权访问该图表');
    return chart;
  }
}
