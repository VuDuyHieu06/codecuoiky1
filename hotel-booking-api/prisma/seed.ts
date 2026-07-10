import { PrismaClient, Role, RoomStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Script seed dữ liệu mẫu — chạy bằng lệnh: npx prisma db seed
 * (hoặc tự động chạy sau `prisma migrate dev` nếu Prisma CLI hỏi).
 *
 * Tạo sẵn:
 *  - 1 tài khoản ADMIN (lễ tân/quản lý) để test các route yêu cầu @Roles(ADMIN)
 *  - 1 tài khoản USER thường để test luồng đặt phòng
 *  - 3 phòng mẫu với các loại và đơn giá khác nhau
 */
async function main() {
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const userPassword = await bcrypt.hash('User@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hotel.com' },
    update: {},
    create: {
      email: 'admin@hotel.com',
      password: adminPassword,
      fullName: 'Quản trị viên Khách sạn',
      role: Role.ADMIN,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@hotel.com' },
    update: {},
    create: {
      email: 'user@hotel.com',
      password: userPassword,
      fullName: 'Nguyễn Văn Khách',
      role: Role.USER,
    },
  });

  const rooms = await Promise.all(
    [
      { roomNumber: '101', roomType: 'Standard', pricePerNight: '500000', status: RoomStatus.AVAILABLE },
      { roomNumber: '201', roomType: 'Deluxe', pricePerNight: '850000', status: RoomStatus.AVAILABLE },
      { roomNumber: '301', roomType: 'Suite', pricePerNight: '1500000', status: RoomStatus.AVAILABLE },
    ].map((room) =>
      prisma.room.upsert({
        where: { roomNumber: room.roomNumber },
        update: {},
        create: room,
      }),
    ),
  );

  console.log('✅ Seed dữ liệu thành công:');
  console.log(`   - Admin: ${admin.email} / mật khẩu: Admin@123`);
  console.log(`   - User:  ${user.email} / mật khẩu: User@123`);
  console.log(`   - ${rooms.length} phòng mẫu đã được tạo`);
}

main()
  .catch((e) => {
    console.error('❌ Seed thất bại:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
