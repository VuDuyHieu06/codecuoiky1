import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './bookings/booking.module';

/**
 * AppModule — module gốc, là điểm khởi đầu của toàn bộ ứng dụng NestJS.
 *
 * Thứ tự import các module:
 *  1. ConfigModule    : phải import trước để các module khác dùng được ConfigService
 *  2. ThrottlerModule : giới hạn tần suất gọi API toàn cục — chống brute-force
 *                       (đặc biệt quan trọng với /auth/login bị dò mật khẩu)
 *  3. PrismaModule    : @Global() — tự expose PrismaService cho toàn ứng dụng
 *  4. AuthModule      : xác thực JWT, cần PrismaService (inject qua Global)
 *  5. BookingModule   : nghiệp vụ chính, cần PrismaService + AuthModule
 */
@Module({
  imports: [
    // Cấu hình biến môi trường — tự tìm file .env ở thư mục gốc
    // isGlobal: true → ConfigService được inject ở mọi nơi không cần re-import
    ConfigModule.forRoot({ isGlobal: true }),

    // Giới hạn mặc định: tối đa 100 request / 60 giây cho mỗi IP trên TOÀN
    // BỘ API. Endpoint nhạy cảm hơn (VD: /auth/login) có thể siết chặt thêm
    // bằng @Throttle({ default: { limit: 5, ttl: 60000 } }) ngay tại route.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    PrismaModule,
    AuthModule,
    BookingModule,
  ],
  providers: [
    // Áp ThrottlerGuard cho TOÀN BỘ ứng dụng thông qua APP_GUARD — không
    // cần khai báo @UseGuards(ThrottlerGuard) lặp lại ở từng controller.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
