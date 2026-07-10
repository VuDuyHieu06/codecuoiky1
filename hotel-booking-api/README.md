# 🏨 Hotel Booking API — NestJS + Prisma + PostgreSQL

API quản lý đặt phòng khách sạn đầy đủ tính năng, xây dựng trên NestJS 10, Prisma 5, PostgreSQL 16.

## 📁 Cấu trúc thư mục

```
src/
├── main.ts                          # Điểm khởi động: Helmet, CORS, Pipe, Filter
├── app.module.ts                    # Root module
├── prisma/
│   ├── prisma.service.ts            # PrismaClient wrapped as Nest Provider
│   └── prisma.module.ts             # Global module — inject PrismaService toàn app
├── auth/
│   ├── auth.controller.ts           # POST /api/v1/auth/register & /login
│   ├── auth.service.ts              # Nghiệp vụ đăng ký/đăng nhập + bcrypt
│   ├── auth.module.ts               # Import JwtModule async từ ConfigService
│   ├── dto/
│   │   ├── register.dto.ts
│   │   └── login.dto.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts          # PassportStrategy(jwt): validate token + load user
│   ├── guards/
│   │   ├── jwt-auth.guard.ts        # Bắt buộc đăng nhập
│   │   └── roles.guard.ts           # Kiểm tra Role từ @Roles() metadata
│   └── decorators/
│       ├── roles.decorator.ts       # @Roles(Role.ADMIN)
│       └── current-user.decorator.ts # @CurrentUser() lấy user từ request
├── bookings/
│   ├── booking.controller.ts        # 8 REST endpoints
│   ├── booking.service.ts           # Nghiệp vụ + race condition prevention
│   ├── booking.module.ts
│   ├── dto/
│   │   ├── create-booking.dto.ts    # roomId, checkInDate, checkOutDate
│   │   ├── update-booking.dto.ts    # PartialType(OmitType) — không cho đổi userId
│   │   └── query-booking.dto.ts     # status, roomId, startDate, endDate, page, limit
│   └── validators/
│       └── is-after-date.validator.ts # Custom validator: checkOut > checkIn
└── common/
    ├── filters/
    │   └── prisma-exception.filter.ts # Global filter: dịch lỗi Prisma → HTTP code
    └── interfaces/
        └── jwt-payload.interface.ts   # { sub, email, role }
prisma/
└── schema.prisma                    # User, Room, Booking models + indexes
```

## 🚀 Cài đặt & Chạy

```bash
# 1. Cài dependencies
npm install

# 2. Cấu hình môi trường
cp .env.example .env
# Chỉnh DATABASE_URL và JWT_SECRET trong .env

# 3. Tạo database và migrate
npx prisma migrate dev --name init

# 4. Sinh Prisma Client
npx prisma generate

# 5. Tạo dữ liệu mẫu (1 ADMIN, 1 USER, 3 phòng) — tuỳ chọn, hữu ích khi test
npx prisma db seed

# 6. Chạy development
npm run start:dev
```

Tài khoản mẫu sau khi seed:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| ADMIN | admin@hotel.com | Admin@123 |
| USER | user@hotel.com | User@123 |

## 📡 Danh sách API Endpoints

**Base URL:** `http://localhost:3000/api/v1`

### Auth (Công khai — không cần token)
| Method | URL | Mô tả |
|--------|-----|-------|
| POST | `/auth/register` | Đăng ký tài khoản mới (role = USER) |
| POST | `/auth/login` | Đăng nhập, nhận JWT access token |

### Bookings (Yêu cầu Bearer token)
| Method | URL | Quyền | Mô tả |
|--------|-----|-------|-------|
| POST | `/bookings` | USER + ADMIN | Tạo đơn đặt phòng |
| GET | `/bookings` | USER (own) / ADMIN (all) | Danh sách booking có lọc + phân trang |
| GET | `/bookings/me` | USER | Booking của bản thân |
| GET | `/bookings/:id` | USER (own) / ADMIN | Chi tiết 1 booking |
| PATCH | `/bookings/:id` | USER (own, PENDING) / ADMIN | Cập nhật ngày/phòng |
| PATCH | `/bookings/:id/confirm` | **ADMIN only** | Xác nhận booking |
| PATCH | `/bookings/:id/cancel` | USER (own) / ADMIN | Huỷ booking |
| DELETE | `/bookings/:id` | **ADMIN only** | Xoá (chỉ booking đã CANCELLED) |

### Ví dụ Request/Response

**POST /auth/login**
```json
// Request body
{ "email": "user@example.com", "password": "password123" }

// Response 200
{
  "user": { "id": "uuid", "email": "user@example.com", "fullName": "Nguyễn Văn A", "role": "USER" },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**POST /bookings**
```json
// Request header: Authorization: Bearer <token>
// Request body
{ "roomId": "uuid-room", "checkInDate": "2026-07-01", "checkOutDate": "2026-07-03" }

// Response 201
{
  "id": "uuid-booking",
  "userId": "uuid-user",
  "roomId": "uuid-room",
  "checkInDate": "2026-07-01T00:00:00.000Z",
  "checkOutDate": "2026-07-03T00:00:00.000Z",
  "totalPrice": "1700000",
  "status": "PENDING",
  "user": { "id": "...", "email": "user@example.com", "fullName": "..." },
  "room": { "id": "...", "roomNumber": "101", "roomType": "Standard" }
}
```

**Lỗi Validation (400)**
```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["checkOutDate phải sau checkInDate"],
  "path": "/api/v1/bookings",
  "timestamp": "2026-06-23T..."
}
```

**Lỗi Conflict (409 — phòng đã có người đặt)**
```json
{
  "success": false,
  "statusCode": 409,
  "error": "Conflict",
  "message": "Phòng đã được đặt trong khoảng 01/07/2026 – 03/07/2026...",
  "path": "/api/v1/bookings",
  "timestamp": "..."
}
```

## 🔐 Bảo mật đã triển khai

| Cơ chế | Mô tả |
|--------|-------|
| **SQL Injection** | Prisma dùng parameterized query 100% — không nối chuỗi SQL |
| **JWT (RS/HS256)** | Access token 1 ngày, verify chữ ký + load lại user từ DB |
| **RBAC** | Phân quyền USER/ADMIN qua `@Roles()` + `RolesGuard` |
| **bcrypt** | Băm mật khẩu 10 rounds, không lưu plaintext |
| **Helmet** | HTTP security headers chống XSS, clickjacking... |
| **CORS** | Giới hạn origin theo `ALLOWED_ORIGINS` trong .env |
| **ValidationPipe** | `whitelist: true` chặn mass assignment |
| **Serializable TX** | Chống race condition khi đặt phòng đồng thời |
| **Rate Limiting** | `ThrottlerModule`: 100 req/phút toàn cục, riêng `/auth/login` chỉ 5 lần/phút/IP chống brute-force |

## 🔄 State Machine — Vòng đời Booking

```
Tạo mới → PENDING ──→ CONFIRMED ──→ (kết thúc)
                  ╲                ↗
                   ╲──→ CANCELLED ─ (kết thúc, không phục hồi)
```
