import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

/**
 * JwtStrategy — chiến lược xác thực của Passport, áp dụng cho mọi route
 * được bảo vệ bởi JwtAuthGuard. Token được trích từ header:
 *   Authorization: Bearer <token>
 *
 * Sau khi Passport verify chữ ký + hạn dùng hợp lệ, hàm validate() được gọi
 * với payload đã giải mã — giá trị trả về sẽ được gắn vào `request.user`,
 * dùng xuyên suốt trong RolesGuard và decorator @CurrentUser().
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: JwtPayload) {
    // Truy vấn lại DB để đảm bảo user vẫn còn tồn tại tại thời điểm gọi API
    // (phòng trường hợp tài khoản đã bị xoá sau khi token được phát hành,
    // hoặc vai trò đã bị thay đổi — luôn lấy role mới nhất, không tin vào
    // role cũ đã "đóng băng" sẵn trong token).
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, fullName: true },
    });

    if (!user) {
      throw new UnauthorizedException('Tài khoản không còn tồn tại');
    }

    return user;
  }
}
