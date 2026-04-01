# School OS Installation Guide

แอปพลิเคชันนี้เป็นระบบบริหารจัดการโรงเรียน (Full-stack React + Express + MySQL)

## 1. การเตรียมตัว (Prerequisites)
- ติดตั้ง **Node.js** (แนะนำเวอร์ชัน 18 ขึ้นไป)
- ติดตั้ง **MySQL Server**

## 2. การติดตั้ง (Installation)
1. แตกไฟล์ ZIP เข้าไปในโฟลเดอร์ที่คุณต้องการ
2. เปิด Terminal/Command Prompt ในโฟลเดอร์นั้น
3. รันคำสั่งเพื่อติดตั้ง Library:
   ```bash
   npm install
   ```

## 3. การตั้งค่าฐานข้อมูล (Database Setup)
1. สร้างฐานข้อมูลใหม่ใน MySQL
2. นำเข้า (Import) ไฟล์ `mysql_schema.sql` เข้าไปในฐานข้อมูลที่สร้าง
3. ก๊อปปี้ไฟล์ `.env.example` เป็น `.env` และแก้ไขข้อมูลการเชื่อมต่อ:
   ```env
   MYSQL_HOST=localhost
   MYSQL_USER=your_username
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=your_db_name
   ```

## 4. การ Build และรัน (Build & Run)
### สำหรับการพัฒนา (Development):
```bash
npm run dev
```

### สำหรับการใช้งานจริง (Production):
1. Build ไฟล์ Frontend:
   ```bash
   npm run build
   ```
2. รัน Server:
   ```bash
   npm start
   ```

## 5. การติดตั้งบน Windows Hosting (Plesk/IIS)
1. นำไฟล์ทั้งหมดในโฟลเดอร์ `dist` ไปวางใน `httpdocs`
2. ตรวจสอบว่ามีไฟล์ `web.config` อยู่ใน `httpdocs` เพื่อให้ Routing ทำงานได้
3. ตั้งค่า Node.js ใน Plesk ให้ชี้ไปที่ไฟล์ `server.ts` (หรือไฟล์ที่ Build แล้ว)
