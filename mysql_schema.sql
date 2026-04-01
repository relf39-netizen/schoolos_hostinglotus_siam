-- MySQL Schema for SchoolOS
-- For Hosting Lotus (MySQL)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 0. ตารางผู้ดูแลระบบสูงสุด (Super Admin)
CREATE TABLE IF NOT EXISTS super_admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- เพิ่มข้อมูล Super Admin เริ่มต้น
INSERT INTO super_admins (username, password, name) 
VALUES ('peyarm', 'Siam@2520', 'Super Admin')
ON DUPLICATE KEY UPDATE password = 'Siam@2520';

-- 1. ตารางโรงเรียน
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  district VARCHAR(255),
  province VARCHAR(255),
  lat DOUBLE,
  lng DOUBLE,
  radius INT DEFAULT 500,
  late_time_threshold VARCHAR(10) DEFAULT '08:30',
  academic_year_start VARCHAR(10),
  academic_year_end VARCHAR(10),
  logo_base_64 LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_suspended BOOLEAN DEFAULT FALSE,
  auto_check_out_enabled BOOLEAN DEFAULT FALSE,
  auto_check_out_time VARCHAR(10) DEFAULT '16:30',
  wfh_mode_enabled BOOLEAN DEFAULT FALSE,
  outgoing_book_prefix VARCHAR(50)
) ENGINE=InnoDB;

-- 2. ตารางโปรไฟล์ผู้ใช้งาน
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(100) PRIMARY KEY,
  school_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) DEFAULT '123456',
  position VARCHAR(255),
  roles LONGTEXT, -- เก็บเป็น ["ROLE1", "ROLE2"]
  signature_base_64 LONGTEXT,
  telegram_chat_id VARCHAR(100),
  is_suspended BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  assigned_classes LONGTEXT, -- เก็บเป็น ["Class1", "Class2"]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. ตารางการตั้งค่าโรงเรียน (API Keys / Config)
CREATE TABLE IF NOT EXISTS school_configs (
  school_id VARCHAR(50) PRIMARY KEY,
  drive_folder_id VARCHAR(255),
  script_url TEXT,
  telegram_bot_token VARCHAR(255),
  telegram_bot_username VARCHAR(255),
  app_base_url TEXT,
  official_garuda_base_64 LONGTEXT,
  officer_department VARCHAR(255),
  internal_departments LONGTEXT,
  external_agencies LONGTEXT,
  director_signature_base_64 LONGTEXT,
  director_signature_scale DOUBLE DEFAULT 1.0,
  director_signature_y_offset DOUBLE DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3.1 ตารางห้องเรียน
CREATE TABLE IF NOT EXISTS class_rooms (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. ตารางงานวิชาการ: จำนวนนักเรียน
CREATE TABLE IF NOT EXISTS academic_enrollments (
  id VARCHAR(100) PRIMARY KEY, -- enroll_{schoolId}_{year}
  school_id VARCHAR(50),
  year VARCHAR(50) NOT NULL,
  levels LONGTEXT NOT NULL, -- เก็บ { "Anuban1": { "m": 0, "f": 0 }, ... }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. ตารางงานวิชาการ: คะแนนสอบเฉลี่ย (RT, NT, O-NET)
CREATE TABLE IF NOT EXISTS academic_test_scores (
  id VARCHAR(100) PRIMARY KEY, -- score_{schoolId}_{type}_{year}
  school_id VARCHAR(50),
  year VARCHAR(50) NOT NULL,
  test_type VARCHAR(50) NOT NULL, -- RT, NT, ONET_P6, ONET_M3
  results LONGTEXT NOT NULL, -- เก็บ { "Math": 50.5, ... }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. ตารางงานวิชาการ: ปฏิทินวิชาการ
CREATE TABLE IF NOT EXISTS academic_calendar (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(50),
  year VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  date DATE,
  start_date DATE NOT NULL,
  end_date DATE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. ตารางงานวิชาการ: รายงาน SAR
CREATE TABLE IF NOT EXISTS academic_sar (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(50),
  year VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL, -- BASIC, EARLY_CHILDHOOD
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. ตารางงบประมาณรายปี (Action Plan)
CREATE TABLE IF NOT EXISTS budget_settings (
  id VARCHAR(100) PRIMARY KEY,
  school_id VARCHAR(50),
  fiscal_year VARCHAR(50),
  subsidy DOUBLE DEFAULT 0,
  learner DOUBLE DEFAULT 0,
  allow_teacher_proposal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9. ตารางโครงการในแผนปฏิบัติการ
CREATE TABLE IF NOT EXISTS plan_projects (
  id VARCHAR(100) PRIMARY KEY,
  school_id VARCHAR(50),
  department_name VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  subsidy_budget DOUBLE DEFAULT 0,
  learner_dev_budget DOUBLE DEFAULT 0,
  actual_expense DOUBLE DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Draft',
  fiscal_year VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 10. ตารางนักเรียน
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  current_class VARCHAR(50) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
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
  is_alumni BOOLEAN DEFAULT FALSE,
  graduation_year VARCHAR(50),
  batch_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11. ตารางการออมทรัพย์นักเรียน
CREATE TABLE IF NOT EXISTS student_savings (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36),
  school_id VARCHAR(50),
  amount DOUBLE NOT NULL,
  type VARCHAR(50) NOT NULL, -- DEPOSIT, WITHDRAWAL
  academic_year VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  edited_at TIMESTAMP NULL DEFAULT NULL,
  edited_by VARCHAR(100),
  edit_reason TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (edited_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 12. ตารางปีการศึกษา
CREATE TABLE IF NOT EXISTS academic_years (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  year VARCHAR(50) NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 13. ตารางบันทึกการมาเรียน (Student Attendance)
CREATE TABLE IF NOT EXISTS student_attendance (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  student_id VARCHAR(36),
  date DATE NOT NULL,
  status VARCHAR(50) NOT NULL, -- Present, Late, Sick, Absent
  academic_year VARCHAR(50) NOT NULL,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 14. ตารางบันทึกสุขภาพ (Student Health Records)
CREATE TABLE IF NOT EXISTS student_health_records (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36),
  school_id VARCHAR(50),
  weight DOUBLE,
  height DOUBLE,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  academic_year VARCHAR(50),
  recorded_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15. ตารางการลงเวลาทำงาน (Attendance)
CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(50),
  teacher_id VARCHAR(100),
  teacher_name VARCHAR(255),
  date DATE NOT NULL,
  check_in_time TIME,
  check_out_time TIME,
  status VARCHAR(50),
  lat DOUBLE,
  lng DOUBLE,
  coordinate LONGTEXT,
  distance_meters DOUBLE,
  is_wfh BOOLEAN DEFAULT FALSE,
  leave_type VARCHAR(50),
  is_auto_checkout BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 16. ตารางการลา (Leave Requests)
CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(50),
  teacher_id VARCHAR(100),
  teacher_name VARCHAR(255),
  teacher_position VARCHAR(255),
  type VARCHAR(50), -- Sick, Personal, OffCampus, Late, Maternity
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  substitute_name VARCHAR(255),
  reason TEXT,
  mobile_phone VARCHAR(50),
  contact_info TEXT,
  status VARCHAR(50) DEFAULT 'Pending',
  director_signature VARCHAR(255),
  approved_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 17. ตารางเอกสาร (Documents)
CREATE TABLE IF NOT EXISTS documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(50),
  category VARCHAR(255),
  book_number VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  `from` VARCHAR(255),
  date DATE,
  timestamp VARCHAR(50),
  priority VARCHAR(50),
  attachments LONGTEXT, -- เก็บเป็น JSON
  status VARCHAR(50) DEFAULT 'Draft',
  director_command TEXT,
  target_teachers LONGTEXT, -- ["ID1", "ID2"]
  acknowledged_by LONGTEXT, -- ["ID1", "ID2"]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_vice_director_id VARCHAR(100),
  vice_director_command TEXT,
  vice_director_signature_date VARCHAR(100),
  director_signature_date VARCHAR(100),
  signed_file_url TEXT,
  created_by VARCHAR(100),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 18. ตารางกิจกรรมผู้อำนวยการ (Director Events)
CREATE TABLE IF NOT EXISTS director_events (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location VARCHAR(255),
  description TEXT,
  notified_one_day_before BOOLEAN DEFAULT FALSE,
  notified_on_day BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 19. ตารางบัญชีการเงิน (Finance Accounts)
CREATE TABLE IF NOT EXISTS finance_accounts (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- Income, Expense
  balance DOUBLE DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 20. ตารางรายการธุรกรรมการเงิน (Finance Transactions)
CREATE TABLE IF NOT EXISTS finance_transactions (
  id VARCHAR(36) PRIMARY KEY,
  school_id VARCHAR(50),
  account_id VARCHAR(36),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE NOT NULL,
  type VARCHAR(50) NOT NULL, -- Income, Expense
  category VARCHAR(100),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
