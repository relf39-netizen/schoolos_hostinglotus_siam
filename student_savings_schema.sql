-- 1. ตารางปีการศึกษา (Academic Years)
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  year TEXT NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ตารางห้องเรียน (Classrooms)
CREATE TABLE IF NOT EXISTS class_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  academic_year TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ตารางนักเรียน (Students)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_class TEXT NOT NULL,
  academic_year TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ตารางบันทึกการออมทรัพย์ (Student Savings)
CREATE TABLE IF NOT EXISTS student_savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL')),
  academic_year TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ตรวจสอบและเพิ่มคอลัมน์สำหรับการแก้ไขข้อมูล (กรณีมีตารางอยู่แล้ว)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_savings' AND column_name='created_by') THEN
        ALTER TABLE student_savings ADD COLUMN created_by TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_savings' AND column_name='edited_at') THEN
        ALTER TABLE student_savings ADD COLUMN edited_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_savings' AND column_name='edited_by') THEN
        ALTER TABLE student_savings ADD COLUMN edited_by TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_savings' AND column_name='edit_reason') THEN
        ALTER TABLE student_savings ADD COLUMN edit_reason TEXT;
    END IF;
END $$;

-- 5. อัปเดตตาราง profiles เพื่อรองรับระบบจัดการครู
-- รันคำสั่งเหล่านี้หากตาราง profiles ยังไม่มีคอลัมน์ดังกล่าว
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='assigned_classes') THEN
        ALTER TABLE profiles ADD COLUMN assigned_classes TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='roles') THEN
        ALTER TABLE profiles ADD COLUMN roles TEXT[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='position') THEN
        ALTER TABLE profiles ADD COLUMN position TEXT;
    END IF;
END $$;

-- สร้าง Index เพื่อความรวดเร็วในการค้นหา
CREATE INDEX IF NOT EXISTS idx_savings_student_id ON student_savings(student_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_savings_school_id ON student_savings(school_id);
