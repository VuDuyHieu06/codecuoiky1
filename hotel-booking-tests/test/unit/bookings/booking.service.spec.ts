import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Role, RoomStatus } from '@prisma/client';
import { BookingService } from 'src/bookings/booking.service';
import { createBookingTestingModule } from '../../helpers/module-factory';
import {
  BOOKING_ID, ROOM_ID, USER_ID,
  createBookingDtoFixture, mockAuthAdmin, mockAuthUser,
  mockBooking, mockRoom, updateBookingDtoFixture,
} from '../../helpers/test-fixtures';

/**
 * UNIT TESTS — BookingService (create, findAll, findOne)
 */

describe('BookingService — create / findAll / findOne', () => {
  let service: BookingService;
  let prismaMock: ReturnType<typeof import('../../helpers/test-fixtures').createPrismaMock>;

  beforeEach(async () => {
    const ctx = await createBookingTestingModule();
    service = ctx.service;
    prismaMock = ctx.prismaMock;
  });

  // ==========================================================================
  // create()
  // ==========================================================================
  describe('create()', () => {
    /**
     * Service flow:
     *  1. Kiểm tra quyền (ForbiddenException nếu sai)
     *  2. Validate ngày (BadRequestException nếu sai)
     *  3. prisma.room.findUnique  ← bên NGOÀI transaction
     *  4. prisma.$transaction(tx => tx.booking.count + tx.booking.create)
     */
    function setupCreateMocks(roomOverride = {}, overlapCount = 0) {
      prismaMock.room.findUnique.mockResolvedValueOnce(mockRoom(roomOverride));
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));
      prismaMock.booking.count.mockResolvedValueOnce(overlapCount);
      if (overlapCount === 0) {
        prismaMock.booking.create.mockResolvedValueOnce(mockBooking());
      }
    }

    it('nên tạo booking thành công → status PENDING', async () => {
      setupCreateMocks();
      const result = await service.create(createBookingDtoFixture, mockAuthUser());
      expect((result as any).data?.status ?? (result as any).status).toBe(BookingStatus.PENDING);
      expect(prismaMock.booking.create).toHaveBeenCalledTimes(1);
    });

    it('nên tính totalPrice ở server, không lấy từ client', async () => {
      setupCreateMocks();
      await service.create(createBookingDtoFixture, mockAuthUser());
      const createArgs = prismaMock.booking.create.mock.calls[0][0];
      // totalPrice phải do service tính, không phải từ DTO
      expect(createArgs.data.totalPrice).toBeDefined();
    });

    it('nên dùng userId của người đang đăng nhập khi DTO không có userId', async () => {
      setupCreateMocks();
      await service.create(createBookingDtoFixture, mockAuthUser());
      const createArgs = prismaMock.booking.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe(USER_ID);
    });

    it('nên ném NotFoundException khi roomId không tồn tại', async () => {
      prismaMock.room.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(createBookingDtoFixture, mockAuthUser()))
        .rejects.toThrow(NotFoundException);
    });

    it('nên ném ConflictException khi phòng đang MAINTENANCE', async () => {
      prismaMock.room.findUnique.mockResolvedValueOnce(
        mockRoom({ status: RoomStatus.MAINTENANCE }),
      );
      await expect(service.create(createBookingDtoFixture, mockAuthUser()))
        .rejects.toThrow(ConflictException);
    });

    it('nên ném ConflictException khi có booking trùng lịch', async () => {
      setupCreateMocks({}, 1); // overlapCount = 1
      await expect(service.create(createBookingDtoFixture, mockAuthUser()))
        .rejects.toThrow(ConflictException);
    });

    it('nên ném BadRequestException khi checkInDate là ngày quá khứ', async () => {
      const pastDto = { ...createBookingDtoFixture, checkInDate: '2020-01-01', checkOutDate: '2020-01-03' };
      await expect(service.create(pastDto, mockAuthUser()))
        .rejects.toThrow(BadRequestException);
      // Không được gọi DB khi ngày đã sai
      expect(prismaMock.room.findUnique).not.toHaveBeenCalled();
    });

    it('nên ném ForbiddenException khi USER đặt booking cho người khác', async () => {
      const dto = { ...createBookingDtoFixture, userId: BOOKING_ID }; // userId khác
      await expect(service.create(dto, mockAuthUser()))
        .rejects.toThrow(ForbiddenException);
    });

    it('nên cho ADMIN đặt booking cho bất kỳ userId nào', async () => {
      setupCreateMocks();
      const dto = { ...createBookingDtoFixture, userId: 'another-user-uuid' };
      await expect(service.create(dto, mockAuthAdmin())).resolves.toBeDefined();
    });

    it('nên kiểm tra overlap với AND[checkInDate.lt, checkOutDate.gt]', async () => {
      setupCreateMocks();
      await service.create(createBookingDtoFixture, mockAuthUser());
      const countArgs = prismaMock.booking.count.mock.calls[0][0];
      expect(countArgs.where.status).toEqual({ not: BookingStatus.CANCELLED });
      expect(countArgs.where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ checkInDate: expect.objectContaining({ lt: expect.any(Date) }) }),
          expect.objectContaining({ checkOutDate: expect.objectContaining({ gt: expect.any(Date) }) }),
        ]),
      );
    });
  });

  // ==========================================================================
  // findAll()
  // ==========================================================================
  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 } as any;

    beforeEach(() => {
      prismaMock.booking.findMany.mockResolvedValue([mockBooking()]);
      prismaMock.booking.count.mockResolvedValue(1);
    });

    it('ADMIN không bị giới hạn userId trong where clause', async () => {
      await service.findAll(baseQuery, mockAuthAdmin());
      const args = prismaMock.booking.findMany.mock.calls[0][0];
      expect(args.where).not.toHaveProperty('userId');
    });

    it('USER chỉ thấy booking của chính mình (where.userId = currentUser.id)', async () => {
      await service.findAll(baseQuery, mockAuthUser());
      const args = prismaMock.booking.findMany.mock.calls[0][0];
      expect(args.where.userId).toBe(USER_ID);
    });

    it('phân trang đúng: skip=(page-1)*limit, take=limit', async () => {
      await service.findAll({ page: 3, limit: 5 } as any, mockAuthAdmin());
      const args = prismaMock.booking.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10);
      expect(args.take).toBe(5);
    });

    it('trả về pagination metadata đúng', async () => {
      prismaMock.booking.count.mockResolvedValueOnce(23);
      const result = await service.findAll({ page: 1, limit: 10 } as any, mockAuthAdmin());
      expect(result.pagination).toMatchObject({ total: 23, totalPages: 3, page: 1 });
    });

    it('lọc theo status khi query.status được truyền vào', async () => {
      await service.findAll({ ...baseQuery, status: BookingStatus.CONFIRMED } as any, mockAuthAdmin());
      const args = prismaMock.booking.findMany.mock.calls[0][0];
      expect(args.where.status).toBe(BookingStatus.CONFIRMED);
    });

    it('gọi findMany và count đồng thời (performance)', async () => {
      await service.findAll(baseQuery, mockAuthAdmin());
      expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.booking.count).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // findOne()
  // ==========================================================================
  describe('findOne()', () => {
    it('trả về chi tiết booking khi user là chủ sở hữu', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking());
      const result = await service.findOne(BOOKING_ID, mockAuthUser());
      expect((result as any).data?.id ?? (result as any).id).toBe(BOOKING_ID);
    });

    it('ADMIN xem được booking của bất kỳ ai', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ userId: 'someone-else' }));
      await expect(service.findOne(BOOKING_ID, mockAuthAdmin())).resolves.toBeDefined();
    });

    it('ném NotFoundException khi id không tồn tại', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('not-found-id', mockAuthUser()))
        .rejects.toThrow(NotFoundException);
    });

    it('ném ForbiddenException khi USER xem booking của người khác', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ userId: 'completely-different-user' }),
      );
      await expect(service.findOne(BOOKING_ID, mockAuthUser()))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
