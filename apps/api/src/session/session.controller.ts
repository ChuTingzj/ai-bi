import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, UserPayload } from '../common/current-user.decorator';
import { SessionService } from './session.service';
import { CreateSessionDto, UpdateSessionDto } from './session.dto';

@Controller('api/sessions')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async list(@CurrentUser() user: UserPayload) {
    return { code: 0, data: await this.sessionService.list(user.id) };
  }

  @Post()
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateSessionDto,
  ) {
    return { code: 0, data: await this.sessionService.create(user.id, dto) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return { code: 0, data: await this.sessionService.update(id, user.id, dto) };
  }

  @Get(':id/messages')
  async messages(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
  ) {
    return {
      code: 0,
      data: await this.sessionService.messages(id, user.id, page, limit),
    };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return { code: 0, data: await this.sessionService.remove(id, user.id) };
  }
}
