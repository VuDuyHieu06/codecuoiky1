import { Role } from '@prisma/client';

/**
 * Cấu trúc dữ liệu được mã hoá bên trong JWT access token.
 * `sub` (subject) là chuẩn JWT dùng để lưu định danh chủ thể token — ở đây
 * chính là userId.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
