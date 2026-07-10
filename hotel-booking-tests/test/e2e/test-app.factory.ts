import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { AllExceptionsFilter } from 'src/common/filters/prisma-exception.filter';
import { createPrismaMock } from '../helpers/test-fixtures';

export type PrismaMockType = ReturnType<typeof createPrismaMock>;

/**
 * Tạo NestJS app đầy đủ cho E2E testing.
 *
 * Chiến lược mock cho E2E test:
 *  - PrismaService → mock hoàn toàn (không cần DB thật) vì mục tiêu là
 *    kiểm tra HTTP layer (routing, guard, pipe, response format),
 *    không phải tầng DB.
 *  - ConfigService → mock với giá trị test cố định.
 *  - Toàn bộ middleware (Helmet, CORS, ValidationPipe, GlobalFilter) được
 *    áp đúng như môi trường production để test phản ánh thực tế.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prismaMock: PrismaMockType;
  jwtService: JwtService;
  httpServer: ReturnType<typeof request>;
}> {
  const prismaMock = createPrismaMock();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          JWT_SECRET: 'e2e-test-jwt-secret-minimum-32-characters!!',
          JWT_EXPIRES_IN: '1d',
          PORT: 3001,
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: 'http://localhost:3001',
        };
        return map[key] ?? fallback;
      },
    })
    .compile();

  const app = moduleFixture.createNestApplication();

  // Áp đúng cấu hình như production (main.ts) để E2E phản ánh thực tế
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();

  const jwtService = moduleFixture.get<JwtService>(JwtService);

  return {
    app,
    prismaMock,
    jwtService,
    httpServer: request(app.getHttpServer()),
  };
}

/**
 * Tạo JWT token hợp lệ cho E2E test — dùng JwtService thật với secret test.
 */
export function createTestToken(
  jwtService: JwtService,
  payload: { sub: string; email: string; role: string },
): string {
  return jwtService.sign(payload, { expiresIn: '1h' });
}
