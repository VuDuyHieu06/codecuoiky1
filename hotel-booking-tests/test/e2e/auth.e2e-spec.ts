import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import {
  ADMIN_ID,
  USER_ID,
  loginDtoFixture,
  mockUser,
  registerDtoFixture,
} from '../helpers/test-fixtures';
import { PrismaMockType, createTestApp } from './test-app.factory';

/**
 * ============================================================================
 * E2E TESTS — Auth Endpoints (/api/v1/auth)
 * ============================================================================
 * E2E test kiểm tra từ góc độ HTTP client:
 *  - Status code trả về đúng
 *  - Response body đúng cấu trúc
 *  - Validation lỗi 400 khi request không hợp lệ
 *  - Bảo mật: password không lọt ra ngoài response
 */

describe('Auth E2E (/api/v1/auth)', () => {
  let app: INestApplication;
  let prismaMock: PrismaMockType;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prismaMock = ctx.prismaMock;
    http = ctx.httpServer;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // POST /api/v1/auth/register
  // ==========================================================================
  describe('POST /api/v1/auth/register', () => {
    it('nên trả về 201 + user + accessToken khi đăng ký thành công', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('hashed' as never);
      prismaMock.user.create.mockResolvedValueOnce(
        mockUser({ email: registerDtoFixture.email, fullName: registerDtoFixture.fullName }),
      );

      const res = await http.post('/api/v1/auth/register').send(registerDtoFixture);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('email', registerDtoFixture.email);
    });

    it('nên ẨN password khỏi response (bảo mật)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('hashed' as never);
      prismaMock.user.create.mockResolvedValueOnce(mockUser());

      const res = await http.post('/api/v1/auth/register').send(registerDtoFixture);

      expect(res.body.user).not.toHaveProperty('password');
    });

    it('nên trả về 409 khi email đã tồn tại', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser()); // Email đã tồn tại

      const res = await http.post('/api/v1/auth/register').send(registerDtoFixture);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('ConflictException');
    });

    it('nên trả về 400 khi thiếu email', async () => {
      const res = await http.post('/api/v1/auth/register').send({
        password: 'Password@123',
        fullName: 'Test',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('nên trả về 400 khi email không đúng định dạng', async () => {
      const res = await http.post('/api/v1/auth/register').send({
        ...registerDtoFixture,
        email: 'not-an-email',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('Email')]),
      );
    });

    it('nên trả về 400 khi password quá ngắn (< 6 ký tự)', async () => {
      const res = await http.post('/api/v1/auth/register').send({
        ...registerDtoFixture,
        password: 'Ab1',
      });

      expect(res.status).toBe(400);
    });

    it('nên trả về 400 khi có field lạ không khai báo trong DTO (whitelist)', async () => {
      const res = await http.post('/api/v1/auth/register').send({
        ...registerDtoFixture,
        isAdmin: true, // Field lạ — mass assignment attack
        role: 'ADMIN', // Cố gắng tự đặt role
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/isAdmin|role/)]),
      );
    });

    it('response lỗi phải có đúng cấu trúc { success, statusCode, error, message, path, timestamp }', async () => {
      const res = await http.post('/api/v1/auth/register').send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        statusCode: 400,
        error: expect.any(String),
        message: expect.anything(),
        path: '/api/v1/auth/register',
        timestamp: expect.any(String),
      });
    });
  });

  // ==========================================================================
  // POST /api/v1/auth/login
  // ==========================================================================
  describe('POST /api/v1/auth/login', () => {
    it('nên trả về 200 + user + accessToken khi đăng nhập thành công', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

      const res = await http.post('/api/v1/auth/login').send(loginDtoFixture);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.id).toBe(USER_ID);
    });

    it('nên ẨN password trong response (bảo mật)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

      const res = await http.post('/api/v1/auth/login').send(loginDtoFixture);

      expect(res.body.user).not.toHaveProperty('password');
    });

    it('nên trả về 401 khi email không tồn tại', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const res = await http.post('/api/v1/auth/login').send(loginDtoFixture);

      expect(res.status).toBe(401);
    });

    it('nên trả về 401 khi mật khẩu sai', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);

      const res = await http.post('/api/v1/auth/login').send(loginDtoFixture);

      expect(res.status).toBe(401);
    });

    it('nên có thông báo lỗi giống nhau cho sai email vs sai password', async () => {
      // Sai email
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      const res1 = await http.post('/api/v1/auth/login').send(loginDtoFixture);

      // Sai password
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);
      const res2 = await http.post('/api/v1/auth/login').send(loginDtoFixture);

      // Cùng message (chống user enumeration attack)
      expect(res1.body.message).toBe(res2.body.message);
    });

    it('nên trả về 400 khi thiếu password', async () => {
      const res = await http.post('/api/v1/auth/login').send({ email: 'user@hotel.com' });

      expect(res.status).toBe(400);
    });
  });
});
