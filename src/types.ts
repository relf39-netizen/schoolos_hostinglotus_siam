
// Data Models

export enum SystemView {
  DASHBOARD = 'DASHBOARD',
  DOCUMENTS = 'DOCUMENTS',
  LEAVE = 'LEAVE',
  FINANCE = 'FINANCE',
  ATTENDANCE = 'ATTENDANCE',
  PLAN = 'PLAN',
  ACADEMIC = 'ACADEMIC', // New View
  SAVINGS = 'SAVINGS',   // New View for Student Savings
  STUDENT_ATTENDANCE = 'STUDENT_ATTENDANCE', // New View for Student Attendance
  ADMIN_USERS = 'ADMIN_USERS',
  PROFILE = 'PROFILE',
  DIRECTOR_CALENDAR = 'DIRECTOR_CALENDAR'
}

// Fix: Added VICE_DIRECTOR and FINANCE_COOP to TeacherRole to resolve type assignment errors
export type TeacherRole = 
  | 'SYSTEM_ADMIN'      // ผู้ดูแลระบบ (จัดการข้อมูลครู)
  | 'ADMIN'             // ผู้ดูแลระบบทั่วไป
  | 'DIRECTOR'          // ผู้อำนวยการ
  | 'VICE_DIRECTOR'     // รองผู้อำนวยการ
  | 'DOCUMENT_OFFICER'  // ธุรการ (รับหนังสือ)
  | 'FINANCE_BUDGET'    // การเงิน (งบประมาณ)
  | 'FINANCE_NONBUDGET' // การเงิน (นอกงบ)
  | 'FINANCE_COOP'      // การเงิน (สหกรณ์)
  | 'PLAN_OFFICER'      // งานแผน (สร้างโครงการ)
  | 'ACADEMIC_OFFICER'  // งานวิชาการ (New)
  | 'ACTING_DIRECTOR'  // รักษาการในตำแหน่งผู้อำนวยการ
  | 'TEACHER';          // ครูทั่วไป

export interface School {
  id: string;      // รหัสโรงเรียน 8 หลัก เช่น 31030019
  name: string;    // ชื่อโรงเรียน
  district?: string;
  province?: string;
  // Fix: Added isSuspended to support school suspension logic
  isSuspended?: boolean;
  
  // School Settings
  logoBase64?: string; // Logo specific to this school
  lat?: number;        // Latitude for Attendance
  lng?: number;        // Longitude for Attendance
  radius?: number;     // Allowed radius in meters
  lateTimeThreshold?: string; // Time string e.g., "08:15"
  autoCheckOutEnabled?: boolean;
  autoCheckOutTime?: string;
  wfhModeEnabled?: boolean; // New: If true, allow check-in from any location
  
  // Outgoing Document Prefix
  outgoingBookPrefix?: string; // e.g. "ศธ ๐๔๐๘๔.๒๐๖"
  
  // Academic Year Settings (MM-DD)
  academicYearStart?: string; // e.g. "05-16"
  academicYearEnd?: string;   // e.g. "03-31" or next year "05-15"
}

export interface Attachment {
  id: string;
  name: string;
  type: 'FILE' | 'LINK'; // FILE = Base64/Storage, LINK = External URL
  url: string; // This holds Base64 for FILE or URL for LINK
  fileType?: string; // MIME type e.g. 'image/png', 'application/pdf'
}

export interface DocumentItem {
  id: string;
  schoolId?: string; // Filter by school
  category?: 'INCOMING' | 'ORDER' | 'OUTGOING'; // NEW: INCOMING=หนังสือรับ, ORDER=หนังสือคำสั่ง, OUTGOING=หนังสือส่ง
  bookNumber: string; // เลขที่รับหนังสือ หรือ เลขที่คำสั่ง
  title: string;
  description: string;
  from: string; // หน่วยงานต้นเรื่อง หรือ หน่วยงานปลายทาง (สำหรับหนังสือส่ง)
  date: string;
  timestamp: string; // เวลาที่รับ
  priority: 'Normal' | 'Urgent' | 'Critical';
  
  // Updated Attachments System
  attachments: Attachment[];

  // Fix: Added PendingViceDirector to status to support multi-level command hierarchy
  status: 'PendingDirector' | 'Distributed' | 'PendingViceDirector'; // รอเกษียณ | สั่งการแล้ว | รอรองเกษียณ
  
  // Director Actions
  directorCommand?: string; // ข้อความเกษียณหนังสือ
  directorSignatureDate?: string;
  signedFileUrl?: string; // URL of the captured image after signing
  targetTeachers: string[]; // IDs of teachers assigned
  
  // Fix: Added missing properties for Vice Director command support
  assignedViceDirectorId?: string;
  viceDirectorCommand?: string;
  viceDirectorSignatureDate?: string;

  // Teacher Actions
  acknowledgedBy: string[]; // IDs of teachers who clicked 'Read'
}

export interface LeaveRequest {
  id: string;
  schoolId?: string;
  teacherId: string;
  teacherName: string;
  teacherPosition?: string; // Snapshot of position at time of request
  type: 'Sick' | 'Personal' | 'OffCampus' | 'Late' | 'Maternity';
  startDate: string;
  endDate: string;
  // For OffCampus or Late
  startTime?: string;
  endTime?: string;
  
  reason: string;
  contactInfo?: string; // Address/Contact info during leave
  mobilePhone?: string; // New: Mobile Phone Number
  status: 'Pending' | 'Approved' | 'Rejected';
  
  // Approval Data
  approvedDate?: string;
  directorSignature?: string; // Director Name
  teacherSignature?: string; // Teacher Name
  createdAt?: string; // ISO String
  
  // Cloud Storage
  evidenceUrl?: string; // URL to the uploaded evidence (e.g. Medical Cert) - User uploaded
  approvedPdfUrl?: string; // URL to the generated PDF with Director Signature - System generated
  attachedFileUrl?: string; // Legacy field, keeping for compatibility
}

// New Interface for Director's Calendar
export interface DirectorEvent {
  id: string;
  schoolId: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime?: string; // HH:MM
  location: string;
  createdBy: string; // User ID (Officer)
  
  // Notification Tracking (to prevent spam on reload)
  notifiedOneDayBefore?: boolean;
  notifiedOnDay?: boolean;
}

export interface FinanceAccount {
  id: string;
  schoolId?: string;
  name: string;
  // Fix: Added Coop to account types to support cooperative finance
  type: 'Budget' | 'NonBudget' | 'Coop';
  description?: string;
}

export interface Transaction {
  id: string;
  schoolId?: string;
  accountId: string; // Links to FinanceAccount
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  refDoc?: string; // Optional reference document
}

// New Interface for Secret Audit Logs
export interface FinanceAuditLog {
  id: string;
  schoolId?: string;
  timestamp: string;
  actorName: string; // Who performed the action
  actionType: 'EDIT' | 'DELETE';
  transactionDescription: string;
  details: string; // Text description of what changed (e.g. "Changed amount from 500 to 1000")
  amountInvolved: number;
}

export interface AttendanceRecord {
  id: string;
  schoolId?: string;
  teacherId: string;
  teacherName: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'OnTime' | 'Late' | 'Absent' | 'Leave';
  leaveType?: string; // If status is Leave
  isAutoCheckout?: boolean; // True if system auto-filled 17:00
  coordinate?: { lat: number; lng: number };
}

export interface Teacher {
  id: string;             // เลขบัตรประชาชน (Username)
  schoolId: string;       // รหัสโรงเรียน
  name: string;
  password?: string;      // Password (hashed or plain for mock)
  position: string;
  roles: TeacherRole[];
  isFirstLogin?: boolean; // True = ต้องเปลี่ยนรหัสผ่าน
  signatureBase64?: string; // User's signature for forms
  telegramChatId?: string; // Telegram Chat ID for notifications
  // Fix: Added isSuspended to support account suspension logic
  isSuspended?: boolean;
  isApproved?: boolean;   // สถานะการอนุมัติเข้าใช้งาน
  isActingDirector?: boolean; // รักษาการในตำแหน่งผู้อำนวยการโรงเรียน
  // Fix: Added createdAt property to resolve missing property error in SuperAdminDashboard
  createdAt?: string;
  assignedClasses?: string[]; // Classes/Rooms this teacher is responsible for
}

// --- Action Plan Types ---

export type ProjectStatus = 'Draft' | 'Approved' | 'Completed';

export interface Project {
  id: string;
  name: string;
  subsidyBudget: number; // เงินอุดหนุน (แผน)
  learnerDevBudget: number; // เงินกิจกรรมพัฒนาผู้เรียน (แผน)
  actualExpense?: number; // NEW: ยอดใช้จ่ายจริง
  status: ProjectStatus;
  rationale?: string;
  fiscalYear?: string; // ปีงบประมาณ (e.g. "2567", "2568")
}

export interface PlanDepartment {
  id: string;
  schoolId?: string;
  name: string; // e.g., กลุ่มบริหารวิชาการ
  projects: Project[];
}

// --- Academic Types (New) ---

export interface EnrollmentData {
  id: string; // e.g., "enroll_2567"
  schoolId: string;
  year: string; // "2567"
  levels: {
      [key: string]: { m: number; f: number }; // key: "Anuban1", "Prathom1"
  };
}

export type TestType = 'RT' | 'NT' | 'ONET' | 'ONET_P6' | 'ONET_M3';

export interface TestScoreData {
  id: string; // e.g., "score_onet_2567"
  schoolId: string;
  year: string;
  testType: TestType;
  results: {
      [subject: string]: number; // e.g., "Thai": 50.5
  };
}

export interface AcademicCalendarEvent {
  id: string;
  schoolId: string;
  year: string; // ปีการศึกษา เช่น "2567"
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description?: string;
}

export type SARType = 'EARLY_CHILDHOOD' | 'BASIC';

export interface AcademicSAR {
  id: string;
  schoolId: string;
  year: string;
  type: SARType;
  fileUrl: string;
  fileName: string;
}

// --- Student Savings Types (New) ---

export interface Student {
  id: string;
  schoolId: string;
  name: string;
  currentClass: string; // e.g., "Prathom 1/1"
  academicYear: string; // e.g., "2567"
  isActive: boolean;
  totalSavings?: number; // Calculated field
  
  // Alumni Fields
  isAlumni?: boolean;
  graduationYear?: string;
  batchNumber?: string;

  // Student Support System Fields (ดูแลช่วยเหลือนักเรียน)
  photoUrl?: string; // Google Drive URL
  address?: string;
  phoneNumber?: string;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  medicalConditions?: string;
  familyAnnualIncome?: number;
  location?: { lat: number; lng: number };
}

export type StudentAttendanceStatus = 'Present' | 'Late' | 'Sick' | 'Absent';

export interface StudentAttendance {
  id: string;
  schoolId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: StudentAttendanceStatus;
  academicYear: string;
  createdBy: string; // Teacher ID
  createdAt: string;
}

export interface StudentHealthRecord {
  id: string;
  studentId: string;
  schoolId: string;
  weight: number;
  height: number;
  recordedDate: string; // YYYY-MM-DD
  academicYear: string;
  recordedBy: string; // Teacher ID
  createdAt: string;
}

export type SavingTransactionType = 'DEPOSIT' | 'WITHDRAWAL';

export interface StudentSaving {
  id: string;
  studentId: string;
  schoolId: string;
  amount: number;
  type: SavingTransactionType;
  academicYear: string;
  createdAt: string;
  createdBy: string; // Teacher ID
  editedAt?: string;
  editedBy?: string;
  editReason?: string;
}

export interface ClassRoom {
  id: string;
  schoolId: string;
  name: string; // e.g., "ป.1/1"
  academicYear: string;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  year: string;
  isCurrent: boolean;
}

// --- System Configuration ---
export interface SystemConfig {
  driveFolderId: string; // Google Drive Folder ID for uploads
  scriptUrl: string;     // Google Apps Script Web App URL for handling uploads
  schoolName?: string;   // School Name for Headers
  officerDepartment?: string; // หน่วยงานภายใน (เช่น กลุ่มงานธุรการ)
  internalDepartments?: string[]; // รายชื่อหน่วยงานภายใน
  externalAgencies?: string[]; // รายชื่อหน่วยงานต้นเรื่อง (ภายนอก) ที่ธุรการจัดการเอง - NEW
  directorSignatureBase64?: string; // Base64 PNG of Director Signature
  schoolLogoBase64?: string; // Base64 PNG of School Logo / Garuda
  
  // Official Document Logo (Garuda) - New
  officialGarudaBase64?: string;

  // Signature Customization
  directorSignatureScale?: number;    // Scale factor (default 1.0)
  directorSignatureYOffset?: number;  // Vertical offset in pixels (default 0)

  // Telegram Notification
  telegramBotToken?: string; // Token from @BotFather
  telegramBotUsername?: string; // Username of the bot (e.g. SchoolOS_Bot)
  appBaseUrl?: string; // The deployed URL of this app (e.g., https://myschool.vercel.app)

  // Outgoing Document Prefix
  outgoingBookPrefix?: string; // e.g. "ศธ ๐๔๐๘๔.๒๐๖"
}
