import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, UserPayload } from '../common/current-user.decorator';
import { ChatService } from './chat.service';
import { ChatStreamDto } from './chat.dto';

function writeSse(res: Response, data: string) {
  res.write(`data: ${data}\n\n`);
  (res as Response & { flush?: () => void }).flush?.();
}

@Controller('api/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * SSE 流式对话。
   * 使用 POST + 手动写 SSE 流（而非 @Sse 装饰器），因为 @Sse 仅支持 GET，
   * 而对话需要携带 JSON body。
   */
  @Post('stream')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  stream(
    @Body() dto: ChatStreamDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // SSE comment：立刻写出首字节，避免代理把 headers 也攒着不发
    res.write(': connected\n\n');
    (res as Response & { flush?: () => void }).flush?.();

    const subscription = this.chatService.handleStream(dto, user).subscribe({
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
