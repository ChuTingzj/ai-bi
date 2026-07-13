import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, UserPayload } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';
import {
  CreateDashboardChartDto,
  UpdateChartPositionDto,
} from './dashboard.dto';

@Controller('api/dashboard/charts')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async list(@CurrentUser() user: UserPayload) {
    return { code: 0, data: await this.dashboardService.list(user.id) };
  }

  @Post()
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateDashboardChartDto,
  ) {
    return { code: 0, data: await this.dashboardService.create(user.id, dto) };
  }

  @Patch(':id/position')
  async updatePosition(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateChartPositionDto,
  ) {
    return {
      code: 0,
      data: await this.dashboardService.updatePosition(user.id, id, dto),
    };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return { code: 0, data: await this.dashboardService.remove(user.id, id) };
  }
}
