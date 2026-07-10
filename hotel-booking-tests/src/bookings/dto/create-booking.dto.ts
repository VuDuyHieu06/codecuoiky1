import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { IsAfterDate } from '../validators/is-after-date.validator';

/**
 * Dữ liệu đầu vào khi tạo đơn đặt phòng mới.
 *
 * LƯU Ý BẢO MẬT QUAN TRỌNG: DTO này KHÔNG có trường `totalPrice`. Giá tiền
 * LUÔN được BookingService tự tính toán dựa trên đơn giá phòng
 * (Room.pricePerNight) và số đêm lưu trú — tuyệt đối không tin tưởng giá
 * trị tiền do client gửi lên, tránh trường hợp người dùng can thiệp request
 * (qua Postman/DevTools...) để đặt phòng với giá 0đ hoặc giá tuỳ ý.
 */
export class CreateBookingDto {
  @IsUUID('4', { message: 'roomId phải là UUID hợp lệ' })
  roomId: string;

  @IsISO8601({}, { message: 'checkInDate phải theo định dạng ISO 8601 (VD: 2026-06-20)' })
  checkInDate: string;

  @IsISO8601({}, { message: 'checkOutDate phải theo định dạng ISO 8601 (VD: 2026-06-23)' })
  @IsAfterDate('checkInDate', { message: 'checkOutDate phải sau checkInDate' })
  checkOutDate: string;

  /**
   * Chỉ ADMIN mới thực sự được phép gán booking cho một User khác (VD: tạo
   * hộ đơn đặt phòng khi khách gọi điện thoại tới quầy lễ tân). Nếu không
   * truyền, hệ thống tự lấy theo người đang đăng nhập.
   *
   * Quyền hạn sử dụng field này được kiểm tra lại một lần nữa trong
   * BookingService — không tin tưởng tuyệt đối vào validate ở tầng DTO,
   * vì DTO chỉ đảm bảo ĐÚNG ĐỊNH DẠNG chứ không đảm bảo ĐÚNG QUYỀN HẠN.
   */
  @IsOptional()
  @IsUUID('4', { message: 'userId phải là UUID hợp lệ' })
  userId?: string;
}
