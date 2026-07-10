import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/**
 * BookingController — Quản lý vòng đời đơn đặt phòng qua RESTful API.
 *
 * Tất cả các endpoint đều yêu cầu JWT hợp lệ (đặt @UseGuards ở cấp
 * controller). Endpoint nào cần quyền ADMIN riêng thì thêm @Roles(Role.ADMIN)
 * kèm RolesGuard ở cấp method.
 *
 * Bảng tổng hợp endpoint:
 * ┌────────────────────────────────┬────────┬───────────────────────────────┐
 * │ URL                             │ Method │ Quyền                         │
 * ├────────────────────────────────┼────────┼───────────────────────────────┤
 * │ /bookings                       │ POST   │ USER, ADMIN                   │
 * │ /bookings                       │ GET    │ USER (own), ADMIN (all)        │
 * │ /bookings/me                    │ GET    │ USER (own)                     │
 * │ /bookings/:id                   │ GET    │ USER (own), ADMIN (any)        │
 * │ /bookings/:id                   │ PATCH  │ USER (own, PENDING), ADMIN    │
 * │ /bookings/:id/confirm           │ PATCH  │ ADMIN only                    │
 * │ /bookings/:id/cancel            │ PATCH  │ USER (own), ADMIN (any)        │
 * │ /bookings/:id                   │ DELETE │ ADMIN only                    │
 * └────────────────────────────────┴────────┴───────────────────────────────┘
 *
 * LƯU Ý: /bookings/me phải khai báo TRƯỚC /bookings/:id để Express không
 * nhầm "me" là UUID và ném ParseUUIDPipe error.
 */
@Controller('bookings')
@UseGuards(JwtAuthGuard) // Bảo vệ toàn bộ controller — bắt buộc đăng nhập
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ─────────────────────────────────────────────────
  // POST /bookings — Tạo đơn đặt phòng mới
  // ─────────────────────────────────────────────────

  /**
   * Tạo đơn đặt phòng mới.
   * Cả USER thường lẫn ADMIN đều có thể gọi — ADMIN có thêm quyền truyền
   * `userId` để tạo hộ cho người dùng khác.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingService.create(dto, user);
  }

  // ─────────────────────────────────────────────────
  // GET /bookings/me — Lấy booking của bản thân
  // ─────────────────────────────────────────────────

  /**
   * Lấy danh sách booking của chính người đang đăng nhập.
   * PHẢI đặt TRƯỚC @Get(':id') để tránh Express/Fastify nhận nhầm
   * chuỗi "me" là tham số :id kiểu UUID.
   */
  @Get('me')
  findMyBookings(@Query() query: QueryBookingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingService.findMyBookings(query, user);
  }

  // ─────────────────────────────────────────────────
  // GET /bookings — Lấy danh sách booking (có lọc + phân trang)
  // ─────────────────────────────────────────────────

  /**
   * ADMIN thấy toàn bộ booking với đầy đủ bộ lọc.
   * USER chỉ thấy booking của chính mình (không thể xem của người khác).
   */
  @Get()
  findAll(@Query() query: QueryBookingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingService.findAll(query, user);
  }

  // ─────────────────────────────────────────────────
  // GET /bookings/:id — Chi tiết 1 booking
  // ─────────────────────────────────────────────────

  /**
   * ParseUUIDPipe tự động từ chối các :id không phải UUID hợp lệ,
   * trả về 400 Bad Request trước khi request chạm tới Service — giúp
   * tránh truy vấn DB với giá trị không hợp lệ và bảo vệ chống SQL
   * injection qua tham số đường dẫn (dù Prisma đã parameterized query,
   * validation sớm vẫn là best practice).
   */
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingService.findOne(id, user);
  }

  // ─────────────────────────────────────────────────
  // PATCH /bookings/:id — Chỉnh sửa ngày / phòng
  // ─────────────────────────────────────────────────

  /**
   * Chỉ cho sửa khi booking đang PENDING.
   * USER chỉ sửa được booking của chính mình.
   * ADMIN sửa được của bất kỳ ai.
   */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingService.update(id, dto, user);
  }

  // ─────────────────────────────────────────────────
  // PATCH /bookings/:id/confirm — Xác nhận booking (ADMIN)
  // ─────────────────────────────────────────────────

  /**
   * Chuyển trạng thái PENDING → CONFIRMED.
   * Chỉ ADMIN mới được gọi endpoint này.
   * Bảo vệ kép: @Roles khai báo ý định + RolesGuard thực thi kiểm tra.
   */
  @Patch(':id/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.confirm(id);
  }

  // ─────────────────────────────────────────────────
  // PATCH /bookings/:id/cancel — Huỷ booking
  // ─────────────────────────────────────────────────

  /**
   * Huỷ đơn đặt phòng.
   * USER chỉ huỷ được booking của mình.
   * ADMIN huỷ được bất kỳ booking nào.
   * Nghiệp vụ kiểm tra trạng thái hợp lệ để huỷ được xử lý trong Service.
   */
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingService.cancel(id, user);
  }

  // ─────────────────────────────────────────────────
  // DELETE /bookings/:id — Xoá vĩnh viễn (ADMIN)
  // ─────────────────────────────────────────────────

  /**
   * Xoá vĩnh viễn booking khỏi DB.
   * Chính sách an toàn: chỉ cho xoá booking đã CANCELLED.
   * Endpoint này chỉ dành cho ADMIN (RolesGuard + @Roles).
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.remove(id);
  }
}
