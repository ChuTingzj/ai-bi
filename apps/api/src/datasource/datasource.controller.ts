import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, UserPayload } from '../common/current-user.decorator';
import { DataSourceService } from './datasource.service';
import { CreateDataSourceDto, UpdateDataSourceDto } from './datasource.dto';

@Controller('api/datasources')
@UseGuards(JwtAuthGuard)
export class DataSourceController {
  constructor(private readonly dataSourceService: DataSourceService) {}

  @Get()
  async list(@CurrentUser() user: UserPayload) {
    return { code: 0, data: await this.dataSourceService.list(user.id) };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return { code: 0, data: await this.dataSourceService.findOne(user.id, id) };
  }

  @Post()
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateDataSourceDto,
  ) {
    return { code: 0, data: await this.dataSourceService.create(user.id, dto) };
  }

  @Put(':id')
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDataSourceDto,
  ) {
    return {
      code: 0,
      data: await this.dataSourceService.update(user.id, id, dto),
    };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return { code: 0, data: await this.dataSourceService.remove(user.id, id) };
  }

  @Post(':id/sync-schema')
  async syncSchema(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return {
      code: 0,
      data: await this.dataSourceService.syncSchema(user.id, id),
    };
  }
}
