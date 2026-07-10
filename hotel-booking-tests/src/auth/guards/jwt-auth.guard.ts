import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JwtAuthGuard — bảo vệ route, yêu cầu request phải kèm Bearer token hợp lệ.
 * Áp dụng bằng @UseGuards(JwtAuthGuard) ở cấp controller hoặc method.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
