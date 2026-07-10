import { IsEmail, IsString, MinLength } from 'class-validator';

/** Dữ liệu đầu vào khi đăng nhập */
export class LoginDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;
}
