import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard — kiểm tra vai trò (role) của user hiện tại (đã được
 * JwtAuthGuard xác thực trước đó) có nằm trong danh sách @Roles(...) khai
 * báo trên route hay không.
 *
 * LƯU Ý THỨ TỰ: Guard này PHẢI chạy SAU JwtAuthGuard vì nó cần
 * `request.user` đã được gán sẵn:
 *   @UseGuards(JwtAuthGuard, RolesGuard)   // đúng thứ tự
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Route không khai báo @Roles(...) -> không giới hạn vai trò, mọi user
    // đã đăng nhập đều được truy cập (việc đã đăng nhập hay chưa do
    // JwtAuthGuard đảm nhiệm, không phải nhiệm vụ của Guard này).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
