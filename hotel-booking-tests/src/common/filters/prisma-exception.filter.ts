import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Bộ lọc ngoại lệ toàn cục (Global Exception Filter).
 *
 * Mục tiêu:
 *  1. Đồng nhất định dạng phản hồi lỗi cho TOÀN BỘ API (success: false,
 *     statusCode, error, message, path, timestamp).
 *  2. Dịch các lỗi kỹ thuật từ Prisma (mã P2xxx) sang mã HTTP phù hợp,
 *     thay vì để lộ chi tiết nội bộ (tên bảng, câu SQL, stack trace...) ra
 *     ngoài — đây là nguyên tắc bảo mật quan trọng: không rò rỉ thông tin
 *     hệ thống cho client.
 *  3. Với lỗi không xác định (bug, mất kết nối DB...), luôn trả về 500 kèm
 *     thông điệp chung chung cho client, đồng thời ghi log đầy đủ ở phía
 *     server để đội ngũ vận hành điều tra.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolveException(exception);

    // Log đầy đủ phía server — đặc biệt quan trọng với lỗi 500 chưa rõ
    // nguyên nhân, để có thể truy vết được sau này.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} | ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /** Phân loại exception và quy đổi sang { status, message, error } chuẩn hoá */
  private resolveException(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    // 1) Lỗi nghiệp vụ do chính ứng dụng chủ động ném ra: NotFoundException,
    //    ConflictException, BadRequestException, ForbiddenException, hoặc
    //    lỗi 400 tự động từ ValidationPipe (class-validator).
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const status = exception.getStatus();
      if (typeof body === 'string') {
        return { status, message: body, error: exception.name };
      }
      const parsed = body as { message?: string | string[]; error?: string };
      return {
        status,
        message: parsed.message ?? exception.message,
        error: parsed.error ?? exception.name,
      };
    }

    // 2) Lỗi đã biết từ Prisma — quy đổi theo mã lỗi chuẩn của Prisma thay
    //    vì để nguyên thông điệp kỹ thuật (vốn chứa tên bảng/cột nội bộ)
    //    lọt ra response.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Vi phạm ràng buộc UNIQUE (VD: email/roomNumber trùng)
          return {
            status: HttpStatus.CONFLICT,
            message: `Dữ liệu đã tồn tại (trùng giá trị tại: ${
              (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'không xác định'
            })`,
            error: 'Conflict',
          };
        case 'P2025': // Không tìm thấy bản ghi cần update/delete
          return {
            status: HttpStatus.NOT_FOUND,
            message: 'Không tìm thấy dữ liệu cần xử lý',
            error: 'Not Found',
          };
        case 'P2003': // Vi phạm khoá ngoại (VD: roomId/userId không tồn tại)
          return {
            status: HttpStatus.BAD_REQUEST,
            message: 'Dữ liệu tham chiếu không hợp lệ (khoá ngoại không tồn tại)',
            error: 'Bad Request',
          };
        case 'P2034': // Xung đột transaction mức Serializable — cần thử lại
          return {
            status: HttpStatus.CONFLICT,
            message: 'Hệ thống đang xử lý một yêu cầu khác trên cùng dữ liệu này. Vui lòng thử lại.',
            error: 'Conflict',
          };
        default:
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Lỗi cơ sở dữ liệu không xác định',
            error: 'Internal Server Error',
          };
      }
    }

    // 3) Dữ liệu gửi lên sai cấu trúc mà Prisma không thể diễn giải
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Dữ liệu gửi lên không đúng định dạng mà hệ thống yêu cầu',
        error: 'Bad Request',
      };
    }

    // 4) Mọi lỗi còn lại (bug chưa lường trước, mất kết nối DB...) — KHÔNG
    //    BAO GIỜ trả chi tiết kỹ thuật (stack trace, tên thư viện...) ra
    //    ngoài để tránh lộ thông tin nhạy cảm của hệ thống cho người dùng.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Đã có lỗi xảy ra ở máy chủ. Vui lòng thử lại sau.',
      error: 'Internal Server Error',
    };
  }
}
