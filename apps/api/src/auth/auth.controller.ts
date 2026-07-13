import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return { code: 0, data: await this.authService.register(dto) };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return { code: 0, data: await this.authService.login(dto) };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return { code: 0, data: await this.authService.refresh(dto.refreshToken) };
  }
}
