import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator @Roles(...) — gắn metadata khai báo những vai trò được phép
 * truy cập 1 route cụ thể. Kết hợp với RolesGuard để thực thi kiểm tra.
 *
 * Ví dụ: @Roles(Role.ADMIN) -> chỉ ADMIN được gọi endpoint.
 * Route KHÔNG gắn @Roles(...) thì mọi user đã đăng nhập (USER lẫn ADMIN)
 * đều gọi được bình thường.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
