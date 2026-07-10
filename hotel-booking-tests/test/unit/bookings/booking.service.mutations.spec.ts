import {
  BadRequestException, ConflictException,
  ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingService } from 'src/bookings/booking.service';
import { createBookingTestingModule } from '../../helpers/module-factory';
import {
  BOOKING_ID, mockAuthAdmin, mockAuthUser, mockBooking, mockRoom,
} from '../../helpers/test-fixtures';

/**
 * UNIT TESTS — BookingService (update, confirm, cancel, remove, state machine)
 */

describe('BookingService — update / confirm / cancel / remove', () => {
  let service: BookingService;
  let prismaMock: ReturnType<typeof import('../../helpers/test-fixtures').createPrismaMock>;

  beforeEach(async () => {
    const ctx = await createBookingTestingModule();
    service = ctx.service;
    prismaMock = ctx.prismaMock;
  });

  // ==========================================================================
  // update()
  // ==========================================================================
  describe('update()', () => {
    const dto = { checkInDate: '2026-08-05', checkOutDate: '2026-08-08' };

    it('cập nhật ngày thành công khi booking đang PENDING', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      prismaMock.room.findUnique.mockResolvedValueOnce(mockRoom());
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));
      prismaMock.booking.count.mockResolvedValueOnce(0);
      prismaMock.booking.update.mockResolvedValueOnce(mockBooking());

      await expect(service.update(BOOKING_ID, dto, mockAuthUser())).resolves.toBeDefined();
      expect(prismaMock.booking.update).toHaveBeenCalledTimes(1);
    });

    it('ném BadRequestException khi booking đã CONFIRMED', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CONFIRMED }));
      await expect(service.update(BOOKING_ID, dto, mockAuthUser()))
        .rejects.toThrow(BadRequestException);
    });

    it('ném BadRequestException khi booking đã CANCELLED', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CANCELLED }));
      await expect(service.update(BOOKING_ID, dto, mockAuthUser()))
        .rejects.toThrow(BadRequestException);
    });

    it('ném NotFoundException khi booking không tồn tại', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);
      await expect(service.update(BOOKING_ID, dto, mockAuthUser()))
        .rejects.toThrow(NotFoundException);
    });

    it('ném ForbiddenException khi USER sửa booking của người khác', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ userId: 'other-user', status: BookingStatus.PENDING }),
      );
      await expect(service.update(BOOKING_ID, dto, mockAuthUser()))
        .rejects.toThrow(ForbiddenException);
    });

    it('loại trừ chính booking đang sửa khỏi kiểm tra overlap (id: { not: bookingId })', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      prismaMock.room.findUnique.mockResolvedValueOnce(mockRoom());
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));
      prismaMock.booking.count.mockResolvedValueOnce(0);
      prismaMock.booking.update.mockResolvedValueOnce(mockBooking());

      await service.update(BOOKING_ID, dto, mockAuthUser());

      const countArgs = prismaMock.booking.count.mock.calls[0][0];
      expect(countArgs.where.id).toEqual({ not: BOOKING_ID });
    });

    it('ném ConflictException khi phòng mới bị trùng lịch', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      prismaMock.room.findUnique.mockResolvedValueOnce(mockRoom());
      prismaMock.$transaction.mockImplementationOnce(async (fn: Function) => fn(prismaMock));
      prismaMock.booking.count.mockResolvedValueOnce(1); // overlap!
      await expect(service.update(BOOKING_ID, dto, mockAuthUser()))
        .rejects.toThrow(ConflictException);
    });

    it('ném BadRequestException khi checkInDate mới là quá khứ', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      const pastDto = { checkInDate: '2020-01-01', checkOutDate: '2020-01-03' };
      await expect(service.update(BOOKING_ID, pastDto, mockAuthUser()))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // confirm()
  // ==========================================================================
  describe('confirm()', () => {
    it('PENDING → CONFIRMED thành công', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      prismaMock.booking.update.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CONFIRMED }));

      await service.confirm(BOOKING_ID);

      expect(prismaMock.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: BookingStatus.CONFIRMED } }),
      );
    });

    it('ném NotFoundException khi không tìm thấy booking', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);
      await expect(service.confirm(BOOKING_ID)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException khi booking đã CONFIRMED rồi', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CONFIRMED }));
      await expect(service.confirm(BOOKING_ID)).rejects.toThrow(BadRequestException);
    });

    it('ném BadRequestException khi booking đã CANCELLED', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CANCELLED }));
      await expect(service.confirm(BOOKING_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // cancel()
  // ==========================================================================
  describe('cancel()', () => {
    it('USER huỷ booking của mình PENDING → CANCELLED', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      prismaMock.booking.update.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CANCELLED }));

      await service.cancel(BOOKING_ID, mockAuthUser());

      expect(prismaMock.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: BookingStatus.CANCELLED } }),
      );
    });

    it('ADMIN huỷ được booking của người khác', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ userId: 'other-user', status: BookingStatus.CONFIRMED }),
      );
      prismaMock.booking.update.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CANCELLED }));
      await expect(service.cancel(BOOKING_ID, mockAuthAdmin())).resolves.toBeDefined();
    });

    it('ném ForbiddenException khi USER huỷ booking của người khác', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(
        mockBooking({ userId: 'other-user', status: BookingStatus.PENDING }),
      );
      await expect(service.cancel(BOOKING_ID, mockAuthUser()))
        .rejects.toThrow(ForbiddenException);
    });

    it('ném BadRequestException khi booking đã bị CANCELLED rồi', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CANCELLED }));
      await expect(service.cancel(BOOKING_ID, mockAuthUser()))
        .rejects.toThrow(BadRequestException);
    });

    it('ném NotFoundException khi booking không tồn tại', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);
      await expect(service.cancel(BOOKING_ID, mockAuthUser()))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================================
  // remove()
  // ==========================================================================
  describe('remove()', () => {
    it('xoá thành công booking đã CANCELLED', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CANCELLED }));
      prismaMock.booking.delete.mockResolvedValueOnce(mockBooking());

      await service.remove(BOOKING_ID);

      expect(prismaMock.booking.delete).toHaveBeenCalledWith({ where: { id: BOOKING_ID } });
    });

    it('ném NotFoundException khi booking không tồn tại', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove(BOOKING_ID)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException khi cố xoá booking PENDING (phải huỷ trước)', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.PENDING }));
      await expect(service.remove(BOOKING_ID)).rejects.toThrow(BadRequestException);
      expect(prismaMock.booking.delete).not.toHaveBeenCalled();
    });

    it('ném BadRequestException khi cố xoá booking CONFIRMED', async () => {
      prismaMock.booking.findUnique.mockResolvedValueOnce(mockBooking({ status: BookingStatus.CONFIRMED }));
      await expect(service.remove(BOOKING_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // State Machine — bảng tất cả transitions hợp lệ và không hợp lệ
  // ==========================================================================
  describe('State Machine — toàn bộ transitions', () => {
    const cases = [
      { from: BookingStatus.PENDING,    action: 'confirm', ok: true  },
      { from: BookingStatus.PENDING,    action: 'cancel',  ok: true  },
      { from: BookingStatus.CONFIRMED,  action: 'cancel',  ok: true  },
      { from: BookingStatus.CONFIRMED,  action: 'confirm', ok: false },
      { from: BookingStatus.CANCELLED,  action: 'confirm', ok: false },
      { from: BookingStatus.CANCELLED,  action: 'cancel',  ok: false },
    ];

    cases.forEach(({ from, action, ok }) => {
      it(`${from} --${action}--> ${ok ? '✅ success' : '❌ BadRequest'}`, async () => {
        prismaMock.booking.findUnique.mockResolvedValue(mockBooking({ status: from }));
        if (ok) prismaMock.booking.update.mockResolvedValue(mockBooking());

        const fn = action === 'confirm'
          ? () => service.confirm(BOOKING_ID)
          : () => service.cancel(BOOKING_ID, mockAuthAdmin());

        if (ok) {
          await expect(fn()).resolves.toBeDefined();
        } else {
          await expect(fn()).rejects.toThrow(BadRequestException);
        }
      });
    });
  });
});
