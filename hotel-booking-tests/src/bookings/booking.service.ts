import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

// ============================================================================
// Các trường phòng được trả kèm theo mỗi Booking (tránh fetch toàn bộ bảng)
// ============================================================================
const BOOKING_INCLUDE = {
  room: {
    select: {
      id: true,
      roomNumber: true,
      roomType: true,
      pricePerNight: true,
    },
  },
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // CREATE — Tạo đặt phòng mới
  // ==========================================================================
  async create(dto: CreateBookingDto, currentUser: AuthenticatedUser) {
    // --- 1. Xác định userId cuối cùng ---
    // Nếu client không gửi userId (trường hợp thông thường) thì dùng id của
    // người đang đăng nhập. Nếu có gửi userId khác (đặt hộ), chỉ ADMIN mới
    // được làm điều này.
    const targetUserId = dto.userId ?? currentUser.id;

    if (dto.userId && dto.userId !== currentUser.id && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN mới được đặt phòng thay mặt người dùng khác');
    }

    // --- 2. Chuyển đổi và kiểm tra ngày hợp lệ ---
    const checkIn = new Date(dto.checkInDate);
    const checkOut = new Date(dto.checkOutDate);

    // Đặt về đầu ngày UTC để so sánh nhất quán, tránh lệch do timezone
    checkIn.setUTCHours(0, 0, 0, 0);
    checkOut.setUTCHours(0, 0, 0, 0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (checkIn < today) {
      throw new BadRequestException('checkInDate không được là ngày trong quá khứ');
    }

    const nights = this.calcNights(checkIn, checkOut);
    if (nights < 1) {
      throw new BadRequestException('checkOutDate phải sau checkInDate ít nhất 1 ngày');
    }

    // --- 3. Kiểm tra phòng tồn tại và không bảo trì ---
    const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room) {
      throw new NotFoundException(`Không tìm thấy phòng với id: ${dto.roomId}`);
    }
    if (room.status === 'MAINTENANCE') {
      throw new ConflictException(`Phòng ${room.roomNumber} đang trong trạng thái bảo trì`);
    }

    // --- 4. Kiểm tra trùng lịch (Conflict Check) ---
    // Dùng $transaction với isolationLevel Serializable để tránh race condition
    // khi nhiều người cùng đặt 1 phòng trong cùng khoảng thời gian. Prisma
    // thực hiện SELECT trên cùng 1 transaction, đảm bảo tính nhất quán tại
    // thời điểm INSERT — không ai có thể xen vào giữa.
    //
    // Điều kiện overlap: booking trùng khi khoảng [checkIn, checkOut) của
    // request MỚI giao với khoảng [existingCheckIn, existingCheckOut) của
    // booking HIỆN TẠI còn hiệu lực (PENDING hoặc CONFIRMED).
    //   Không trùng khi: newCheckOut <= existingCheckIn  ||  newCheckIn >= existingCheckOut
    //   => Trùng khi: NOT (newCheckOut <= existingCheckIn || newCheckIn >= existingCheckOut)
    //              = newCheckOut > existingCheckIn  AND  newCheckIn < existingCheckOut
    const booking = await this.prisma.$transaction(
      async (tx) => {
        const overlap = await tx.booking.count({
          where: {
            roomId: dto.roomId,
            status: { not: BookingStatus.CANCELLED },
            AND: [
              { checkInDate: { lt: checkOut } },  // existingCheckIn  < newCheckOut
              { checkOutDate: { gt: checkIn } },  // existingCheckOut > newCheckIn
            ],
          },
        });

        if (overlap > 0) {
          throw new ConflictException(
            `Phòng ${room.roomNumber} đã được đặt trong khoảng thời gian này`,
          );
        }

        // --- 5. Tính tổng tiền ---
        // Giá tiền do SERVER tính dựa trên dữ liệu phòng trong DB — client
        // không có quyền can thiệp vào trường này (xem comment trong DTO).
        const totalPrice = Number(room.pricePerNight) * nights;

        // --- 6. Tạo booking ---
        return tx.booking.create({
          data: {
            userId: targetUserId,
            roomId: dto.roomId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            totalPrice,
            status: BookingStatus.PENDING,
          },
          include: BOOKING_INCLUDE,
        });
      },
      {
        // Serializable đảm bảo 2 transaction đọc dữ liệu cùng lúc không thể
        // cùng thấy "phòng còn trống" rồi cùng INSERT thành công.
        isolationLevel: 'Serializable' as any,
        maxWait: 5000,  // Tối đa 5 giây chờ lấy transaction slot
        timeout: 10000, // Tối đa 10 giây để toàn bộ transaction hoàn thành
      },
    );

    return this.wrapSuccess('Đặt phòng thành công', booking);
  }

  // ==========================================================================
  // FIND ALL — Danh sách booking (ADMIN thấy tất cả, USER chỉ thấy của mình)
  // ==========================================================================
  /**
   * LƯU Ý THỨ TỰ THAM SỐ: (query, currentUser) — khớp với cách Controller
   * gọi `this.bookingService.findAll(query, user)`, vì @Query() luôn được
   * Nest bind trước @CurrentUser() theo thứ tự khai báo decorator trên
   * route handler.
   */
  async findAll(query: QueryBookingDto, currentUser: AuthenticatedUser) {
    return this.queryBookings(query, this.buildScopedWhere(query, currentUser));
  }

  // ==========================================================================
  // FIND MY BOOKINGS — Danh sách booking của CHÍNH người đang đăng nhập
  // ==========================================================================
  /**
   * Khác với findAll (ADMIN xem được tất cả), endpoint này LUÔN ép where.userId
   * = currentUser.id bất kể vai trò gì — dùng cho trang "Đặt phòng của tôi"
   * mà cả USER và ADMIN đều có thể có nhu cầu xem lịch sử cá nhân.
   */
  async findMyBookings(query: QueryBookingDto, currentUser: AuthenticatedUser) {
    const where: Prisma.BookingWhereInput = {
      ...this.buildBaseFilters(query),
      userId: currentUser.id,
    };
    return this.queryBookings(query, where);
  }

  /** Xây where-clause theo bộ lọc query string (status/roomId/startDate/endDate) */
  private buildBaseFilters(query: QueryBookingDto): Prisma.BookingWhereInput {
    const { status, roomId, startDate, endDate } = query as QueryBookingDto & {
      startDate?: string;
      endDate?: string;
    };
    return {
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
      ...(startDate ? { checkInDate: { gte: new Date(startDate) } } : {}),
      ...(endDate ? { checkOutDate: { lte: new Date(endDate) } } : {}),
    };
  }

  /** Áp thêm ràng buộc phạm vi dữ liệu theo vai trò: USER chỉ thấy của mình */
  private buildScopedWhere(
    query: QueryBookingDto,
    currentUser: AuthenticatedUser,
  ): Prisma.BookingWhereInput {
    const base = this.buildBaseFilters(query);
    return currentUser.role === Role.ADMIN ? base : { ...base, userId: currentUser.id };
  }

  /** Thực thi truy vấn phân trang dùng chung cho findAll/findMyBookings */
  private async queryBookings(query: QueryBookingDto, where: Prisma.BookingWhereInput) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    // Chạy đồng thời 2 truy vấn (lấy trang hiện tại + đếm tổng) để giảm
    // tổng thời gian round-trip tới PostgreSQL.
    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: BOOKING_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      success: true,
      data: bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================================================
  // FIND ONE — Xem chi tiết 1 booking
  // ==========================================================================
  async findOne(id: string, currentUser: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: BOOKING_INCLUDE,
    });

    if (!booking) {
      throw new NotFoundException(`Không tìm thấy đặt phòng với id: ${id}`);
    }

    // Kiểm tra quyền truy cập: chỉ chủ nhân booking hoặc ADMIN mới được xem
    this.assertOwnerOrAdmin(booking.userId, currentUser);

    return this.wrapSuccess('Lấy thông tin đặt phòng thành công', booking);
  }

  // ==========================================================================
  // UPDATE — Sửa ngày hoặc phòng (chỉ khi đang PENDING)
  // ==========================================================================
  async update(id: string, dto: UpdateBookingDto, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.booking.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy đặt phòng với id: ${id}`);
    }

    this.assertOwnerOrAdmin(existing.userId, currentUser);

    // Chỉ cho phép sửa khi đơn chưa được xác nhận hoặc đã thanh toán.
    // Booking CONFIRMED/CANCELLED không sửa qua API thông thường — phải qua
    // flow nghiệp vụ riêng (ví dụ: huỷ trước rồi tạo mới).
    if (existing.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Chỉ có thể sửa đặt phòng ở trạng thái PENDING. Trạng thái hiện tại: ${existing.status}`,
      );
    }

    // Merge giá trị mới (nếu có) với giá trị hiện tại trong DB
    const newRoomId = dto.roomId ?? existing.roomId;
    const newCheckIn = dto.checkInDate ? new Date(dto.checkInDate) : new Date(existing.checkInDate);
    const newCheckOut = dto.checkOutDate ? new Date(dto.checkOutDate) : new Date(existing.checkOutDate);

    newCheckIn.setUTCHours(0, 0, 0, 0);
    newCheckOut.setUTCHours(0, 0, 0, 0);

    // Kiểm tra ngày sau khi merge (trường hợp chỉ gửi 1 trong 2 field ngày)
    if (newCheckOut <= newCheckIn) {
      throw new BadRequestException('checkOutDate phải sau checkInDate');
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (newCheckIn < today) {
      throw new BadRequestException('checkInDate không được là ngày trong quá khứ');
    }

    // Lấy thông tin phòng mới (có thể là phòng cũ hoặc phòng mới đổi sang)
    const room = await this.prisma.room.findUnique({ where: { id: newRoomId } });
    if (!room) {
      throw new NotFoundException(`Không tìm thấy phòng với id: ${newRoomId}`);
    }
    if (room.status === 'MAINTENANCE') {
      throw new ConflictException(`Phòng ${room.roomNumber} đang trong trạng thái bảo trì`);
    }

    const nights = this.calcNights(newCheckIn, newCheckOut);

    const updated = await this.prisma.$transaction(
      async (tx) => {
        // Kiểm tra trùng lịch — loại trừ chính booking đang được sửa
        const overlap = await tx.booking.count({
          where: {
            id: { not: id }, // <-- loại trừ booking hiện tại
            roomId: newRoomId,
            status: { not: BookingStatus.CANCELLED },
            AND: [
              { checkInDate: { lt: newCheckOut } },
              { checkOutDate: { gt: newCheckIn } },
            ],
          },
        });

        if (overlap > 0) {
          throw new ConflictException(
            `Phòng ${room.roomNumber} đã được đặt trong khoảng thời gian yêu cầu`,
          );
        }

        const totalPrice = Number(room.pricePerNight) * nights;

        return tx.booking.update({
          where: { id },
          data: {
            roomId: newRoomId,
            checkInDate: newCheckIn,
            checkOutDate: newCheckOut,
            totalPrice,
          },
          include: BOOKING_INCLUDE,
        });
      },
      { isolationLevel: 'Serializable' as any, maxWait: 5000, timeout: 10000 },
    );

    return this.wrapSuccess('Cập nhật đặt phòng thành công', updated);
  }

  // ==========================================================================
  // CONFIRM — Xác nhận booking PENDING -> CONFIRMED (chỉ ADMIN)
  // Tách thành endpoint riêng (thay vì PATCH chung kèm field status) để:
  //  1. Áp dụng @Roles(Role.ADMIN) rõ ràng ngay tại route, không cần if/else
  //     phân quyền theo giá trị status bên trong Service.
  //  2. URL tự mô tả hành động nghiệp vụ (POST/PATCH /bookings/:id/confirm)
  //     thay vì PATCH chung với body { status: 'CONFIRMED' } khó audit log.
  // ==========================================================================
  async confirm(id: string) {
    const existing = await this.prisma.booking.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy đặt phòng với id: ${id}`);
    }

    if (existing.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Chỉ có thể xác nhận đặt phòng đang ở trạng thái PENDING. Trạng thái hiện tại: ${existing.status}`,
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED },
      include: BOOKING_INCLUDE,
    });

    return this.wrapSuccess('Đã xác nhận đặt phòng thành công', updated);
  }

  // ==========================================================================
  // CANCEL — Huỷ đặt phòng (chủ booking hoặc ADMIN)
  // ==========================================================================
  async cancel(id: string, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.booking.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy đặt phòng với id: ${id}`);
    }

    this.assertOwnerOrAdmin(existing.userId, currentUser);

    if (existing.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Đặt phòng này đã được huỷ trước đó');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
      include: BOOKING_INCLUDE,
    });

    return this.wrapSuccess('Đã huỷ đặt phòng thành công', updated);
  }

  // ==========================================================================
  // DELETE — Xoá vĩnh viễn (chỉ ADMIN, chỉ booking đã CANCELLED)
  // ==========================================================================
  async remove(id: string) {
    const existing = await this.prisma.booking.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy đặt phòng với id: ${id}`);
    }

    // Không cho phép xoá booking còn hiệu lực để giữ lịch sử giao dịch
    if (existing.status !== BookingStatus.CANCELLED) {
      throw new BadRequestException(
        'Chỉ được phép xoá vĩnh viễn đặt phòng đã ở trạng thái CANCELLED',
      );
    }

    await this.prisma.booking.delete({ where: { id } });

    return this.wrapSuccess('Đã xoá đặt phòng thành công', { id });
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /** Kiểm tra quyền sở hữu: ném ForbiddenException nếu không phải chủ/ADMIN */
  private assertOwnerOrAdmin(ownerId: string, currentUser: AuthenticatedUser): void {
    if (currentUser.role !== Role.ADMIN && ownerId !== currentUser.id) {
      throw new ForbiddenException('Bạn không có quyền thao tác với đặt phòng này');
    }
  }

  /** Tính số đêm lưu trú (đơn vị tính phí) */
  private calcNights(checkIn: Date, checkOut: Date): number {
    const ms = checkOut.getTime() - checkIn.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  /** Bao bọc kết quả thành công theo cấu trúc thống nhất của API */
  private wrapSuccess<T>(message: string, data: T) {
    return { success: true, message, data };
  }
}
