-- SQL Script to Reset and Align Student Data Schema for MySQL
-- This script will drop existing tables and recreate them to ensure consistency.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. ตารางปีการศึกษา (Academic Years)
DROP TABLE IF EXISTS academic_years;
CREATE TABLE academic_years (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL,
  year VARCHAR(10) NOT NULL,
  is_current TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_year (school_id, year)
) ENGINE=InnoDB;

-- 2. ตารางห้องเรียน (Classrooms)
DROP TABLE IF EXISTS class_rooms;
CREATE TABLE class_rooms (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  academic_year VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_class (school_id, name)
) ENGINE=InnoDB;

-- 3. ตารางนักเรียน (Students)
DROP TABLE IF EXISTS students;
CREATE TABLE students (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  current_class VARCHAR(100) NOT NULL,
  academic_year VARCHAR(10),
  is_active TINYINT(1) DEFAULT 1,
  
  -- ข้อมูลส่วนตัวและติดต่อ
  photo_url TEXT,
  address TEXT,
  phone_number VARCHAR(50),
  father_name VARCHAR(255),
  mother_name VARCHAR(255),
  guardian_name VARCHAR(255),
  medical_conditions TEXT,
  family_annual_income DOUBLE,
  lat DOUBLE,
  lng DOUBLE,
  
  -- ข้อมูลศิษย์เก่า
  is_alumni TINYINT(1) DEFAULT 0,
  graduation_year VARCHAR(10),
  batch_number VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_student (school_id, name),
  INDEX idx_class (current_class)
) ENGINE=InnoDB;

-- 4. ตารางบันทึกการออมทรัพย์ (Student Savings)
DROP TABLE IF EXISTS student_savings;
CREATE TABLE student_savings (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36) NOT NULL,
  school_id VARCHAR(50) NOT NULL,
  amount DOUBLE NOT NULL,
  type ENUM('DEPOSIT', 'WITHDRAWAL') NOT NULL,
  academic_year VARCHAR(10),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMP NULL,
  edited_by VARCHAR(100),
  edit_reason TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_savings (student_id),
  INDEX idx_school_savings (school_id)
) ENGINE=InnoDB;

-- 5. ตารางบันทึกการมาเรียน (Student Attendance)
DROP TABLE IF EXISTS student_attendance;
CREATE TABLE student_attendance (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  date DATE NOT NULL,
  status ENUM('Present', 'Late', 'Sick', 'Absent') NOT NULL,
  academic_year VARCHAR(10) NOT NULL,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_student_date (student_id, date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. ตารางบันทึกสุขภาพ (Student Health Records)
DROP TABLE IF EXISTS student_health_records;
CREATE TABLE student_health_records (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36) NOT NULL,
  school_id VARCHAR(50),
  weight DOUBLE,
  height DOUBLE,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  academic_year VARCHAR(10),
  recorded_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. ตารางระบบดูแลช่วยเหลือนักเรียน (Student Support Records)
-- สำหรับเก็บข้อมูลการเยี่ยมบ้าน, SDQ, คัดกรอง ฯลฯ
DROP TABLE IF EXISTS student_support_records;
CREATE TABLE student_support_records (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36) NOT NULL,
  school_id VARCHAR(50) NOT NULL,
  type ENUM('HOME_VISIT', 'SDQ_TEACHER', 'SDQ_STUDENT', 'SDQ_PARENT', 'SCREENING', 'EQ') NOT NULL,
  data JSON NOT NULL, -- เก็บข้อมูลแบบฟอร์มเป็น JSON
  academic_year VARCHAR(10) NOT NULL,
  recorded_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_support (student_id, type)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
