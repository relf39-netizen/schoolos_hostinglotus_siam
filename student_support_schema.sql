-- 1. ตารางบันทึกการมาเรียน (Student Attendance)
CREATE TABLE IF NOT EXISTS student_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Late', 'Sick', 'Absent')),
  academic_year TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, date)
);

-- แก้ไขประเภทคอลัมน์หากเป็น UUID ให้เป็น TEXT (เพื่อรองรับรหัสโรงเรียน 8 หลัก)
DO $$ 
BEGIN 
    -- สำหรับ student_attendance
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_attendance' AND column_name='school_id' AND data_type='uuid') THEN
        ALTER TABLE student_attendance ALTER COLUMN school_id TYPE TEXT;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_attendance' AND column_name='created_by' AND data_type='uuid') THEN
        ALTER TABLE student_attendance ALTER COLUMN created_by TYPE TEXT;
    END IF;

    -- สำหรับ student_health_records
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_health_records' AND column_name='school_id' AND data_type='uuid') THEN
        ALTER TABLE student_health_records ALTER COLUMN school_id TYPE TEXT;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_health_records' AND column_name='recorded_by' AND data_type='uuid') THEN
        ALTER TABLE student_health_records ALTER COLUMN recorded_by TYPE TEXT;
    END IF;
END $$;

-- 2. ตารางบันทึกสุขภาพ (Student Health Records)
CREATE TABLE IF NOT EXISTS student_health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  school_id TEXT,
  weight NUMERIC(5,2),
  height NUMERIC(5,2),
  recorded_at TIMESTAMPTZ DEFAULT now(),
  academic_year TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. อัปเดตตารางนักเรียน (Students) เพื่อรองรับข้อมูลเพิ่มเติม
DO $$ 
BEGIN 
    -- เพิ่มคอลัมน์หากยังไม่มี
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='photo_url') THEN
        ALTER TABLE students ADD COLUMN photo_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='address') THEN
        ALTER TABLE students ADD COLUMN address TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='phone_number') THEN
        ALTER TABLE students ADD COLUMN phone_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='father_name') THEN
        ALTER TABLE students ADD COLUMN father_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='mother_name') THEN
        ALTER TABLE students ADD COLUMN mother_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='guardian_name') THEN
        ALTER TABLE students ADD COLUMN guardian_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='medical_conditions') THEN
        ALTER TABLE students ADD COLUMN medical_conditions TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='family_annual_income') THEN
        ALTER TABLE students ADD COLUMN family_annual_income NUMERIC(15,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='lat') THEN
        ALTER TABLE students ADD COLUMN lat NUMERIC(10,7);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='lng') THEN
        ALTER TABLE students ADD COLUMN lng NUMERIC(10,7);
    END IF;

    -- เพิ่มคอลัมน์ is_alumni และอื่นๆ หากยังไม่มี
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='is_alumni') THEN
        ALTER TABLE students ADD COLUMN is_alumni BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='graduation_year') THEN
        ALTER TABLE students ADD COLUMN graduation_year TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='batch_number') THEN
        ALTER TABLE students ADD COLUMN batch_number TEXT;
    END IF;
END $$;

-- สร้าง Index เพื่อความรวดเร็ว
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON student_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON student_attendance(date);
CREATE INDEX IF NOT EXISTS idx_health_student_id ON student_health_records(student_id);
