import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Dữ liệu đầu vào khi đăng ký tài khoản mới (luôn tạo với role = USER) */
export class RegisterDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu không được vượt quá 72 ký tự' }) // giới hạn của bcrypt
  password: string;

  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Họ tên không được vượt quá 100 ký tự' })
  fullName: string;
}
