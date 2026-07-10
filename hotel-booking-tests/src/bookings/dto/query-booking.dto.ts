import { IsEnum, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@prisma/client';

/**
 * Các tham số query string để lọc và phân trang danh sách booking.
 *
 *  Ví dụ: GET /bookings?status=PENDING&page=1&limit=10&startDate=2026-06-01
 *
 * Dùng @Type(() => Number) để class-transformer tự ép kiểu query string
 * (vốn luôn là string) sang number trước khi class-validator kiểm tra.
 * Nhớ bật `transform: true` trong ValidationPipe ở main.ts.
 */
export class QueryBookingDto {
  /** Lọc theo trạng thái booking */
  @IsOptional()
  @IsEnum(BookingStatus, {
    message: `status phải là một trong: ${Object.values(BookingStatus).join(', ')}`,
  })
  status?: BookingStatus;

  /** Lọc theo phòng cụ thể (chỉ ADMIN dùng thực sự hữu ích) */
  @IsOptional()
  @IsUUID('4', { message: 'roomId phải là UUID hợp lệ' })
  roomId?: string;

  /** Lọc booking có checkInDate >= startDate (ISO 8601) */
  @IsOptional()
  @IsISO8601({}, { message: 'startDate phải theo định dạng ISO 8601 (VD: 2026-06-01)' })
  startDate?: string;

  /** Lọc booking có checkOutDate <= endDate (ISO 8601) */
  @IsOptional()
  @IsISO8601({}, { message: 'endDate phải theo định dạng ISO 8601 (VD: 2026-06-30)' })
  endDate?: string;

  /** Số trang (bắt đầu từ 1) — mặc định là 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên dương' })
  @Min(1)
  page?: number = 1;

  /** Số lượng kết quả mỗi trang — mặc định 10, tối đa 100 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên dương' })
  @Min(1)
  @Max(100, { message: 'Tối đa 100 kết quả mỗi trang' })
  limit?: number = 10;
}
