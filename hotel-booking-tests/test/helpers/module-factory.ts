import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { BookingService } from 'src/bookings/booking.service';
import { createConfigMock, createJwtMock, createPrismaMock } from './test-fixtures';

/**
 * Factory tạo NestJS Testing Module cho AuthService.
 * Inject toàn bộ dependency dưới dạng mock để test độc lập.
 */
export async function createAuthTestingModule() {
  const prismaMock = createPrismaMock();
  const jwtMock = createJwtMock();
  const configMock = createConfigMock();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: JwtService, useValue: jwtMock },
      { provide: ConfigService, useValue: configMock },
    ],
  }).compile();

  return {
    module,
    service: module.get<AuthService>(AuthService),
    prismaMock,
    jwtMock,
    configMock,
  };
}

/**
 * Factory tạo NestJS Testing Module cho BookingService.
 */
export async function createBookingTestingModule() {
  const prismaMock = createPrismaMock();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BookingService,
      { provide: PrismaService, useValue: prismaMock },
    ],
  }).compile();

  return {
    module,
    service: module.get<BookingService>(BookingService),
    prismaMock,
  };
}
