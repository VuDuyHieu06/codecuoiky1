import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

/**
 * BookingModule — đóng gói toàn bộ tính năng Quản lý đặt phòng.
 *
 * PrismaService được inject tự động thông qua @Global() của PrismaModule —
 * không cần import PrismaModule lại ở đây.
 */
@Module({
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService], // Export để các module khác (VD: ReportModule) có thể tái sử dụng
})
export class BookingModule {}
