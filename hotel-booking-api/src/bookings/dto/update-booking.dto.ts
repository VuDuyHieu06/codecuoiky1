import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateBookingDto } from './create-booking.dto';

/**
 * Dữ liệu đầu vào khi cập nhật đơn đặt phòng (đổi ngày và/hoặc đổi phòng).
 *
 *  - PartialType: kế thừa toàn bộ validation của CreateBookingDto nhưng cho
 *    phép bỏ trống field nào không cần thay đổi (mọi field trở thành optional).
 *  - OmitType(['userId']): loại bỏ field `userId` — KHÔNG cho phép đổi chủ
 *    sở hữu một đơn đặt phòng đã tồn tại thông qua API cập nhật, tránh tình
 *    huống "chuyển nhượng" booking trái phép giữa các tài khoản.
 *
 * Việc chỉ cho sửa khi đơn đang ở trạng thái PENDING được kiểm tra ở tầng
 * nghiệp vụ (BookingService), không phải trách nhiệm của DTO.
 */
export class UpdateBookingDto extends PartialType(
  OmitType(CreateBookingDto, ['userId'] as const),
) {}
