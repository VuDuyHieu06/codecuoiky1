import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { mockAuthAdmin, mockAuthUser } from '../../helpers/test-fixtures';

/**
 * ============================================================================
 * UNIT TESTS — RolesGuard
 * ============================================================================
 * RolesGuard là thành phần quan trọng nhất của phân quyền — mọi endpoint
 * admin phụ thuộc vào nó. Cần test kỹ tất cả combinations.
 */

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  /** Helper tạo mock ExecutionContext với user và handler cụ thể */
  function createMockContext(user: ReturnType<typeof mockAuthUser>, requiredRoles?: Role[]): ExecutionContext {
    const mockHandler = jest.fn();
    const mockClass = jest.fn();

    // Phải mock Reflector trả về roles trước khi tạo context
    reflector.getAllAndOverride.mockReturnValueOnce(requiredRoles);

    return {
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new RolesGuard(reflector);
  });

  it('nên cho qua khi route không có @Roles() (không giới hạn vai trò)', () => {
    const ctx = createMockContext(mockAuthUser(), undefined); // không có roles metadata
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('nên cho qua khi @Roles([]) rỗng (không yêu cầu vai trò cụ thể)', () => {
    const ctx = createMockContext(mockAuthUser(), []);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('nên cho qua USER khi route yêu cầu Role.USER', () => {
    const ctx = createMockContext(mockAuthUser(), [Role.USER]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('nên cho qua ADMIN khi route yêu cầu Role.ADMIN', () => {
    const ctx = createMockContext(mockAuthAdmin(), [Role.ADMIN]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('nên CHẶN USER khi route chỉ dành cho ADMIN', () => {
    const ctx = createMockContext(mockAuthUser(), [Role.ADMIN]);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('nên CHẶN khi user là null (lý do: JWT không hợp lệ đã lọt qua)', () => {
    reflector.getAllAndOverride.mockReturnValueOnce([Role.ADMIN]);
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: null }) }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('nên ADMIN được qua route yêu cầu User hoặc Admin', () => {
    const ctx = createMockContext(mockAuthAdmin(), [Role.USER, Role.ADMIN]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('nên đọc metadata từ cả handler lẫn class (method-level ưu tiên hơn class-level)', () => {
    // Reset và dùng mockReturnValue (không phải Once) để mock vẫn còn sau createMockContext
    reflector.getAllAndOverride.mockReset();
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const mockHandler = jest.fn();
    const mockClass = jest.fn();
    const ctx = {
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({ getRequest: () => ({ user: mockAuthAdmin() }) }),
    } as unknown as ExecutionContext;
    guard.canActivate(ctx);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });
});
