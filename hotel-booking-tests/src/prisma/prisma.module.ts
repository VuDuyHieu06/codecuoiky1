import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule được đánh dấu @Global() để mọi module khác trong ứng dụng
 * có thể inject PrismaService trực tiếp mà KHÔNG cần import PrismaModule
 * lặp lại ở từng nơi sử dụng (AuthModule, BookingModule...).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
