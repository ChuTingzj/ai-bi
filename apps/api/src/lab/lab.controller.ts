import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, UserPayload } from '../common/current-user.decorator';
import { LabService } from './lab.service';
import { LabRunDto } from './lab.dto';

function writeSse(res: Response, data: string) {
  res.write(`data: ${data}\n\n`);
  (res as Response & { flush?: () => void }).flush?.();
}

@Controller('api/lab')
@UseGuards(JwtAuthGuard)
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Post('run')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  run(
    @Body() dto: LabRunDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');
    (res as Response & { flush?: () => void }).flush?.();

    const subscription = this.labService.handleRun(dto, user).subscribe({
      next: (event) => {
        writeSse(res, event.data);
      },
      complete: () => {
        res.end();
      },
      error: () => {
        res.end();
      },
    });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }
}
