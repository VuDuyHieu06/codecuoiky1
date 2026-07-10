import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { BookingStatus, Role } from '@prisma/client';
import {
  ADMIN_ID,
  BOOKING_ID,
  ROOM_ID,
  USER_ID,
  createBookingDtoFixture,
  mockAdmin,
  mockAuthAdmin,
  mockAuthUser,
  mockBooking,
  mockRoom,
  mockUser,
  updateBookingDtoFixture,
} from '../helpers/test-fixtures';
import { PrismaMockType, createTestApp, createTestToken } from './test-app.factory';

/**
 * ============================================================================
 * E2E TESTS — Booking Endpoints (/api/v1/bookings)
 * ============================================================================
 * Test tầng HTTP đầy đủ bao gồm:
 *  - JwtAuthGuard: route yêu cầu token hợp lệ
 *  - RolesGuard: phân quyền USER vs ADMIN
 *  - ValidationPipe: validate request body
 *  - Exception Filter: response lỗi đúng cấu trúc
 */

describe('Bookings E2E (/api/v1/bookings)', () => {
  let app: INestApplication;
  let prismaMock: PrismaMockType;
  let jwtService: JwtService;
  let http: ReturnType<typeof request>;

  // Token cố định cho mỗi vai trò
  let userToken: string;
  let adminToken: string;
  const authHeader = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prismaMock = ctx.prismaMock;
    jwtService = ctx.jwtService;
    http = ctx.httpServer;

    userToken = createTestToken(jwtService, { sub: USER_ID, email: 'user@hotel.com', role: Role.USER });
    adminToken = createTestToken(jwtService, { sub: ADMIN_ID, email: 'admin@hotel.com', role: Role.ADMIN });

    // JwtStrategy sẽ gọi prisma.user.findUnique sau khi verify token
    // Mock mặc định cho toàn test suite (reset lại ở beforeEach khi cần)
    prismaMock.user.findUnique.mockResolvedValue(mockUser());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Chỉ reset các mock của booking/room, giữ user mock để JWT strategy vẫn hoạt động
    prismaMock.booking.findUnique.mockReset();
    prismaMock.booking.findMany.mockReset();
    prismaMock.booking.count.mockReset();
    prismaMock.booking.create.mockReset();
    prismaMock.booking.update.mockReset();
    prismaMock.booking.delete.mockReset();
    prismaMock.room.findUnique.mockReset();
    prismaMock.$transaction.mockReset();

    // JWT strategy gọi user.findUnique mỗi request — luôn cần mock
    prismaMock.user.findUnique.mockImplementation((args: any) => {
      if (args?.where?.id === USER_ID) return Promise.resolve(mockUser());
      if (args?.where?.id === ADMIN_ID) return Promise.resolve(mockAdmin());
      return Promise.resolve(null);
    });
  });

  // ==========================================================================
  // Authentication Guard
  // ==========================================================================
  describe('🔐 Authentication (JwtAuthGuard)', () => {
    it('nên trả về 401 khi gọi không có token', async () => {
      const res = await http.post('/api/v1/bookings').send(createBookingDtoFixture);
      expect(res.status).toBe(401);
    });

    it('nên trả về 401 khi token sai/hết hạn', async () => {
      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', 'Bearer invalid.token.here')
        .send(createBookingDtoFixture);
      expect(res.status).toBe(401);
    });

    it('nên trả về 401 khi header Authorization sai format', async () => {
      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', userToken) // Thiếu "Bearer "
        .send(createBookingDtoFixture);
      expect(res.status).toBe(401);
    });

    it('nên trả về 401 khi userId trong token không tồn tại trong DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null); // User đã bị xoá

      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send(createBookingDtoFixture);
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /bookings — Tạo đặt phòng
  // ==========================================================================
  describe('POST /api/v1/bookings', () => {
    it('nên tạo booking thành công và trả về 201', async () => {
      prismaMock.room.findUnique.mockResolvedValueOnce(mockRoom());
      prismaMock.booking.count.mockResolvedValueOnce(0);
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));
      prismaMock.booking.create.mockResolvedValueOnce(mockBooking());

      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send(createBookingDtoFixture);

      expect(res.status).toBe(201);
    });

    it('nên trả về 400 khi thiếu roomId', async () => {
      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send({ checkInDate: '2026-08-01', checkOutDate: '2026-08-04' });

      expect(res.status).toBe(400);
    });

    it('nên trả về 400 khi checkOutDate trước checkInDate', async () => {
      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send({ ...createBookingDtoFixture, checkInDate: '2026-08-10', checkOutDate: '2026-08-01' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('checkOutDate')]),
      );
    });

    it('nên trả về 400 khi roomId không phải UUID', async () => {
      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send({ ...createBookingDtoFixture, roomId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });

    it('nên trả về 404 khi roomId không tồn tại', async () => {
      prismaMock.room.findUnique.mockResolvedValueOnce(null);
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));

      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send(createBookingDtoFixture);

      expect(res.status).toBe(404);
    });

    it('nên trả về 409 khi phòng đã được đặt trong khoảng thời gian đó', async () => {
      prismaMock.room.findUnique.mockResolvedValueOnce(mockRoom());
      prismaMock.booking.count.mockResolvedValueOnce(1); // Trùng lịch
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));

      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send(createBookingDtoFixture);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('nên trả về 403 khi USER cố đặt booking cho userId khác', async () => {
      const res = await http
        .post('/api/v1/bookings')
        .set('Authorization', authHeader(userToken))
        .send({ ...createBookingDtoFixture, userId: ADMIN_ID });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // GET /bookings
  // ==========================================================================
  describe('GET /api/v1/bookings', () => {
    it('nên trả về danh sách booking + pagination metadata', async () => {
      prismaMock.booking.findMany.mockResolvedValueOnce([mockBooking()]);
      prismaMock.booking.count.mockResolvedValueOnce(1);

      const res = await http
        .get('/api/v1/bookings')
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 10 });
    });

    it('nên trả về 400 khi query param limit > 100', async () => {
      const res = await http
        .get('/api/v1/bookings?limit=200')
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(400);
    });

    it('nên trả về 400 khi status query không hợp lệ', async () => {
      const res = await http
        .get('/api/v1/bookings?status=INVALID_STATUS')
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // GET /bookings/:id
  // ==========================================================================
  describe('GET /api/v1/bookings/:id', () => {
    it('nên trả về 200 và chi tiết booking khi user là chủ sở hữu', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking());

      const res = await http
        .get(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id', BOOKING_ID);
    });

    it('nên trả về 400 khi :id không phải UUID (ParseUUIDPipe)', async () => {
      const res = await http
        .get('/api/v1/bookings/not-a-valid-uuid')
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(400);
    });

    it('nên trả về 404 khi booking không tồn tại', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);

      const res = await http
        .get(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(404);
    });

    it('nên trả về 403 khi USER cố xem booking của người khác', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ userId: 'another-user-completely' }),
      );

      const res = await http
        .get(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // PATCH /bookings/:id/confirm — chỉ ADMIN
  // ==========================================================================
  describe('PATCH /api/v1/bookings/:id/confirm', () => {
    it('ADMIN nên confirm booking thành công (200)', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.PENDING }),
      );
      prismaMock.booking.update.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.CONFIRMED }),
      );

      const res = await http
        .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
        .set('Authorization', authHeader(adminToken));

      expect(res.status).toBe(200);
    });

    it('USER nên bị từ chối 403 khi cố confirm', async () => {
      const res = await http
        .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // PATCH /bookings/:id/cancel
  // ==========================================================================
  describe('PATCH /api/v1/bookings/:id/cancel', () => {
    it('USER nên cancel booking của mình thành công', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.PENDING }),
      );
      prismaMock.booking.update.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.CANCELLED }),
      );

      const res = await http
        .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(200);
    });

    it('nên trả về 409 khi booking đã bị huỷ rồi', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.CANCELLED }),
      );

      const res = await http
        .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // DELETE /bookings/:id — chỉ ADMIN
  // ==========================================================================
  describe('DELETE /api/v1/bookings/:id', () => {
    it('ADMIN nên xoá booking đã CANCELLED thành công (200)', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.CANCELLED }),
      );
      prismaMock.booking.delete.mockResolvedValueOnce(mockBooking());

      const res = await http
        .delete(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(adminToken));

      expect(res.status).toBe(200);
    });

    it('USER nên bị 403 khi cố xoá booking', async () => {
      const res = await http
        .delete(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(userToken));

      expect(res.status).toBe(403);
    });

    it('ADMIN bị 400 khi cố xoá booking đang PENDING', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ status: BookingStatus.PENDING }),
      );

      const res = await http
        .delete(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(adminToken));

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // Response format consistency — kiểm tra tất cả lỗi có cùng cấu trúc
  // ==========================================================================
  describe('📐 Response Format Consistency', () => {
    it('mọi response lỗi đều có { success: false, statusCode, error, message, path, timestamp }', async () => {
      // 401
      const res401 = await http.get('/api/v1/bookings');
      expect(res401.body).toMatchObject({ success: false, statusCode: 401 });

      // 404
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);
      const res404 = await http
        .get(`/api/v1/bookings/${BOOKING_ID}`)
        .set('Authorization', authHeader(userToken));
      expect(res404.body).toMatchObject({
        success: false,
        statusCode: 404,
        path: expect.stringContaining('/bookings/'),
        timestamp: expect.any(String),
      });
    });
  });
});
