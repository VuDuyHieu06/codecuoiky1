import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Kiểu dữ liệu user được gắn vào request sau khi đi qua JwtAuthGuard */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
}

/**
 * @CurrentUser() — decorator tiện ích lấy nhanh thông tin user đang đăng
 * nhập ngay trong tham số controller, thay vì phải viết `req.user` lặp đi
 * lặp lại ở mọi nơi.
 *
 * Ví dụ: create(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
