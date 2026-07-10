import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/**
 * AuthController — 2 endpoint công khai (KHÔNG cần token) để người dùng
 * tạo tài khoản và đăng nhập lấy JWT access token.
 *
 * LƯU Ý BẢO MẬT: Cố tình KHÔNG có endpoint nào cho phép tự nâng quyền lên
 * ADMIN qua API công khai. Việc tạo tài khoản ADMIN đầu tiên nên được thực
 * hiện thủ công ở tầng database (VD: Prisma Studio) bởi người vận hành hệ
 * thống, tránh lỗ hổng leo thang đặc quyền (privilege escalation).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Siết chặt hơn mức mặc định toàn cục (100/60s): chỉ cho tối đa 5 lần thử
  // đăng nhập mỗi phút cho mỗi IP — giảm thiểu rủi ro brute-force dò mật khẩu.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
