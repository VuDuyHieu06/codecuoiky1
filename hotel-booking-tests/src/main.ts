import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/prisma-exception.filter';

/**
 * Hàm bootstrap khởi động ứng dụng NestJS.
 *
 * Các cài đặt bảo mật được áp dụng ở đây (tầng ứng dụng), trước khi
 * request chạm tới bất kỳ controller hay middleware nào:
 *
 *  1. Helmet      — Tự động gán các HTTP security headers quan trọng:
 *                   Content-Security-Policy, X-Frame-Options, X-XSS-Protection,
 *                   Strict-Transport-Security… Giảm thiểu một loạt tấn công
 *                   phía client (clickjacking, MIME sniffing, XSS...).
 *
 *  2. CORS        — Giới hạn nguồn gốc được phép gọi API. Trong production,
 *                   thay '*' bằng danh sách domain cụ thể (VD: các domain của
 *                   Booking Website và Web Admin) để ngăn các trang lạ gọi API.
 *
 *  3. ValidationPipe — Tự động validate request body dựa trên class-validator
 *                   decorators trong DTO. Cấu hình quan trọng:
 *                   - whitelist: true  → loại bỏ HOÀN TOÀN mọi field lạ không
 *                     khai báo trong DTO, phòng tấn công mass assignment
 *                     (người dùng cố gắng truyền thêm field như isAdmin=true).
 *                   - forbidNonWhitelisted: true → trả 400 nếu client gửi field
 *                     lạ thay vì âm thầm bỏ qua — fail-fast, rõ lỗi hơn.
 *                   - transform: true → class-transformer ép kiểu tự động
 *                     (query param string→number, string→Date...).
 *
 *  4. Global Exception Filter — Bắt MỌI exception, chuẩn hoá response lỗi
 *                   thành định dạng thống nhất, dịch mã lỗi Prisma sang HTTP
 *                   code tương ứng, che giấu chi tiết kỹ thuật nội bộ.
 *
 * Về bảo mật SQL Injection: Prisma dùng parameterized query 100% — mọi
 * tham số người dùng nhập (ID, tên, email...) đều được gửi tách biệt với
 * câu SQL, không bao giờ nối chuỗi trực tiếp. ORM đảm bảo điều này ở tầng
 * thấp nhất, không phụ thuộc vào việc lập trình viên nhớ escape thủ công.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Tắt logger mặc định của NestJS cho các request thành công —
    // trong production nên dùng Morgan hoặc Winston thay thế.
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // ── Bảo mật HTTP Headers (Helmet) ─────────────────────────────────────
  app.use(helmet());

  // ── CORS ───────────────────────────────────────────────────────────────
  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS', '*');
  app.enableCors({
    origin: nodeEnv === 'production'
      ? allowedOrigins.split(',').map((o) => o.trim()) // Danh sách domain production
      : true, // Cho phép tất cả trong môi trường dev
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── Prefix toàn cục ────────────────────────────────────────────────────
  // Mọi endpoint có dạng /api/v1/... — dễ versioning về sau
  app.setGlobalPrefix('api/v1');

  // ── ValidationPipe toàn cục ────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Loại bỏ field lạ không khai báo trong DTO
      forbidNonWhitelisted: true, // Trả 400 nếu gửi field lạ (thay vì âm thầm bỏ qua)
      transform: true,           // Ép kiểu tự động (string → number, string → Date)
      transformOptions: {
        enableImplicitConversion: true, // Ép kiểu ngầm định cho query params
      },
      stopAtFirstError: false,   // Trả về TẤT CẢ lỗi validation cùng lúc, không chỉ lỗi đầu
    }),
  );

  // ── Global Exception Filter ────────────────────────────────────────────
  // Reflector inject để filter có thể đọc metadata (VD: role) nếu cần mở rộng
  const reflector = app.get(Reflector);
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
  console.log(`\n🏨  Hotel Booking API đang chạy tại: http://localhost:${port}/api/v1`);
  console.log(`📦  Môi trường: ${nodeEnv}\n`);
}

bootstrap();
