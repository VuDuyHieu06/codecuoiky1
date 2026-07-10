import { BookingStatus, Decimal, Role, RoomStatus } from '@prisma/client';

// ── Cố định ngày để test không bị flaky ──────────────────────────────────────
export const FIXED_DATE  = new Date('2026-07-01T00:00:00.000Z');
export const FUTURE_CHECK_IN  = new Date('2026-08-01T00:00:00.000Z');
export const FUTURE_CHECK_OUT = new Date('2026-08-04T00:00:00.000Z');
export const NIGHTS = 3;

export const USER_ID    = 'aaaaaaaa-0000-4000-8000-000000000001';
export const ADMIN_ID   = 'aaaaaaaa-0000-4000-8000-000000000002';
export const ROOM_ID    = 'bbbbbbbb-0000-4000-8000-000000000001';
export const BOOKING_ID = 'cccccccc-0000-4000-8000-000000000001';

// ── Fake Decimal helper ───────────────────────────────────────────────────────
function fakeDecimal(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
    toFixed: () => String(value),
    mul: (n: number) => fakeDecimal(value * n),
    plus: (n: number) => fakeDecimal(value + n),
    minus: (n: number) => fakeDecimal(value - n),
  } as unknown as Decimal;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

export interface UserFixture {
  id: string; email: string; password: string;
  fullName: string; role: Role; createdAt: Date; updatedAt: Date;
}
export interface RoomFixture {
  id: string; roomNumber: string; roomType: string;
  pricePerNight: Decimal; status: RoomStatus; createdAt: Date; updatedAt: Date;
}
export interface BookingFixture {
  id: string; userId: string; roomId: string;
  checkInDate: Date; checkOutDate: Date;
  totalPrice: Decimal; status: BookingStatus;
  createdAt: Date; updatedAt: Date;
  room?: Partial<RoomFixture>; user?: Partial<UserFixture>;
}
export interface AuthUserFixture {
  id: string; email: string; fullName: string; role: Role;
}

export function mockUser(o: Partial<UserFixture> = {}): UserFixture {
  return {
    id: USER_ID, email: 'user@hotel.com',
    password: '$2b$10$abcdefghijklmnopqrstuvuDummyHashForTestingOnlyXXXXXXXXX',
    fullName: 'Nguyễn Văn Khách', role: Role.USER,
    createdAt: FIXED_DATE, updatedAt: FIXED_DATE, ...o,
  };
}

export function mockAdmin(o: Partial<UserFixture> = {}): UserFixture {
  return mockUser({ id: ADMIN_ID, email: 'admin@hotel.com',
    fullName: 'Quản Trị Viên', role: Role.ADMIN, ...o });
}

export function mockRoom(o: Partial<RoomFixture> = {}): RoomFixture {
  return {
    id: ROOM_ID, roomNumber: '101', roomType: 'Deluxe',
    pricePerNight: fakeDecimal(850000),
    status: RoomStatus.AVAILABLE,
    createdAt: FIXED_DATE, updatedAt: FIXED_DATE, ...o,
  };
}

export function mockBooking(o: Partial<BookingFixture> = {}): BookingFixture {
  return {
    id: BOOKING_ID, userId: USER_ID, roomId: ROOM_ID,
    checkInDate: FUTURE_CHECK_IN, checkOutDate: FUTURE_CHECK_OUT,
    totalPrice: fakeDecimal(2550000), status: BookingStatus.PENDING,
    createdAt: FIXED_DATE, updatedAt: FIXED_DATE,
    room: { id: ROOM_ID, roomNumber: '101', roomType: 'Deluxe',
            pricePerNight: fakeDecimal(850000) },
    user: { id: USER_ID, email: 'user@hotel.com', fullName: 'Nguyễn Văn Khách' },
    ...o,
  };
}

export function mockAuthUser(o: Partial<AuthUserFixture> = {}): AuthUserFixture {
  return { id: USER_ID, email: 'user@hotel.com',
    fullName: 'Nguyễn Văn Khách', role: Role.USER, ...o };
}
export function mockAuthAdmin(o: Partial<AuthUserFixture> = {}): AuthUserFixture {
  return mockAuthUser({ id: ADMIN_ID, email: 'admin@hotel.com',
    fullName: 'Quản Trị Viên', role: Role.ADMIN, ...o });
}

// ── Prisma Mock ───────────────────────────────────────────────────────────────
export function createPrismaMock() {
  const delegate = () => ({
    findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
    create: jest.fn(), update: jest.fn(), upsert: jest.fn(),
    delete: jest.fn(), count: jest.fn(),
  });
  return {
    user: delegate(), room: delegate(), booking: delegate(),
    $transaction: jest.fn(), $connect: jest.fn(), $disconnect: jest.fn(),
  };
}

export function createJwtMock() {
  return {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    verify: jest.fn(), decode: jest.fn(),
  };
}

export function createConfigMock(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      const map: Record<string, unknown> = {
        JWT_SECRET: 'test-jwt-secret-32-chars-minimum!!',
        JWT_EXPIRES_IN: '1d', PORT: 3000, NODE_ENV: 'test', ...overrides,
      };
      return map[key] ?? fallback;
    }),
  };
}

// ── DTO Fixtures ──────────────────────────────────────────────────────────────
export const createBookingDtoFixture = {
  roomId: ROOM_ID,
  checkInDate: '2026-08-01',
  checkOutDate: '2026-08-04',
};
export const updateBookingDtoFixture = {
  checkInDate: '2026-08-05',
  checkOutDate: '2026-08-08',
};
export const registerDtoFixture = {
  email: 'newuser@hotel.com',
  password: 'Password@123',
  fullName: 'Người Dùng Mới',
};
export const loginDtoFixture = {
  email: 'user@hotel.com',
  password: 'Password@123',
};
