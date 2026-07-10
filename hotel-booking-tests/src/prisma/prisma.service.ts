import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — bọc PrismaClient thành một Nest Provider có thể inject
 * vào bất kỳ Service nào trong ứng dụng.
 *
 *  - onModuleInit:    tự động mở kết nối tới PostgreSQL khi ứng dụng khởi động.
 *  - onModuleDestroy: tự động đóng connection pool khi ứng dụng tắt, tránh
 *                      rò rỉ kết nối (connection leak) khi restart/deploy lại.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Chỉ log cảnh báo/lỗi để không làm rối console khi chạy production;
      // có thể bật thêm 'query' tạm thời khi cần debug hiệu năng truy vấn.
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Đã kết nối tới PostgreSQL qua Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
