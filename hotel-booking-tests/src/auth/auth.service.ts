import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/** Số vòng băm bcrypt — 10-12 là mức cân bằng phổ biến giữa bảo mật & hiệu năng */
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Đăng ký tài khoản mới — luôn tạo với role mặc định USER */
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email này đã được đăng ký');
    }

    // Băm mật khẩu bằng bcrypt trước khi lưu — TUYỆT ĐỐI không lưu plaintext.
    // bcrypt tự sinh salt ngẫu nhiên cho từng user, chống tấn công rainbow table.
    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
        role: Role.USER,
      },
    });

    const safeUser = this.toSafeUser(user);
    return { user: safeUser, accessToken: this.signToken(safeUser) };
  }

  /** Đăng nhập — xác thực email/mật khẩu và phát hành JWT access token */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Cố ý dùng CHUNG 1 thông báo lỗi cho cả 2 trường hợp "sai email" và
    // "sai mật khẩu" — tránh lộ thông tin email nào đã tồn tại trong hệ
    // thống (chống tấn công dò email - user enumeration attack).
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const safeUser = this.toSafeUser(user);
    return { user: safeUser, accessToken: this.signToken(safeUser) };
  }

  /** Loại bỏ field `password` trước khi trả dữ liệu user ra ngoài API */
  private toSafeUser(user: { id: string; email: string; fullName: string; role: string }) {
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }

  /** Ký JWT chứa thông tin tối thiểu cần thiết để định danh + phân quyền */
  private signToken(user: { id: string; email: string; role: string }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
    };
    return this.jwtService.sign(payload);
  }
}
