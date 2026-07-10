import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { createAuthTestingModule } from '../../helpers/module-factory';
import {
  USER_ID, loginDtoFixture, mockUser, registerDtoFixture,
} from '../../helpers/test-fixtures';

// Mock toàn bộ module bcrypt — cách duy nhất hoạt động với CommonJS + Jest
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: ReturnType<typeof import('../../helpers/test-fixtures').createPrismaMock>;
  let jwtMock: ReturnType<typeof import('../../helpers/test-fixtures').createJwtMock>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const ctx = await createAuthTestingModule();
    service = ctx.service;
    prismaMock = ctx.prismaMock;
    jwtMock = ctx.jwtMock;
  });

  // ==========================================================================
  // register()
  // ==========================================================================
  describe('register()', () => {
    it('trả về user (không có password) + JWT khi đăng ký thành công', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed_pw');
      prismaMock.user.create.mockResolvedValueOnce(
        mockUser({ email: registerDtoFixture.email, password: 'hashed_pw' }),
      );

      const result = await service.register(registerDtoFixture);

      expect(result).toHaveProperty('accessToken');
      expect(result.user).toHaveProperty('email', registerDtoFixture.email);
      expect(result.user).not.toHaveProperty('password');
    });

    it('băm mật khẩu bằng bcrypt với SALT_ROUNDS=10 trước khi lưu', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed_pw');
      prismaMock.user.create.mockResolvedValueOnce(mockUser());

      await service.register(registerDtoFixture);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDtoFixture.password, 10);
    });

    it('lưu password là hash, không phải plaintext', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('super_hashed');
      prismaMock.user.create.mockResolvedValueOnce(mockUser());

      await service.register(registerDtoFixture);

      const createCall = prismaMock.user.create.mock.calls[0][0];
      expect(createCall.data.password).toBe('super_hashed');
      expect(createCall.data.password).not.toBe(registerDtoFixture.password);
    });

    it('luôn tạo tài khoản với role = USER (không thể tự đặt ADMIN)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hash');
      prismaMock.user.create.mockResolvedValueOnce(mockUser());

      await service.register(registerDtoFixture);

      const createCall = prismaMock.user.create.mock.calls[0][0];
      expect(createCall.data.role).toBe('USER');
    });

    it('ném ConflictException khi email đã tồn tại', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      await expect(service.register(registerDtoFixture))
        .rejects.toThrow(ConflictException);
    });

    it('không gọi user.create khi email đã tồn tại', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      await service.register(registerDtoFixture).catch(() => {});
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // login()
  // ==========================================================================
  describe('login()', () => {
    it('trả về user + JWT khi đăng nhập thành công', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.login(loginDtoFixture);

      expect(result).toHaveProperty('accessToken');
      expect(result.user.id).toBe(USER_ID);
      expect(result.user).not.toHaveProperty('password');
    });

    it('ném UnauthorizedException khi email không tồn tại', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.login(loginDtoFixture))
        .rejects.toThrow(UnauthorizedException);
    });

    it('ném UnauthorizedException khi mật khẩu sai', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      await expect(service.login(loginDtoFixture))
        .rejects.toThrow(UnauthorizedException);
    });

    it('thông báo lỗi sai email = sai password (chống user enumeration)', async () => {
      // Sai email
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      let msg1 = '';
      await service.login(loginDtoFixture).catch((e) => { msg1 = e.message; });

      // Sai password
      prismaMock.user.findUnique.mockResolvedValueOnce(mockUser());
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      let msg2 = '';
      await service.login(loginDtoFixture).catch((e) => { msg2 = e.message; });

      expect(msg1).toBe(msg2);
      expect(msg1.length).toBeGreaterThan(0);
    });

    it('ký JWT với payload { sub, email, role }', async () => {
      const user = mockUser();
      prismaMock.user.findUnique.mockResolvedValueOnce(user);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await service.login(loginDtoFixture);

      expect(jwtMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: user.id, email: user.email, role: user.role }),
      );
    });
  });
});
