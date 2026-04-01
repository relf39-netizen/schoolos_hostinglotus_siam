import { DirectorEvent, DocumentItem, LeaveRequest, FinanceAccount, Transaction, Teacher, School, AttendanceRecord, PlanDepartment, EnrollmentData, TestScoreData } from './types';

export const CURRENT_SCHOOL_YEAR = "2567";

export const ACADEMIC_POSITIONS = [
    'ผู้อำนวยการเชี่ยวชาญ',
    'ผู้อำนวยการชำนาญการพิเศษ',
    'รองผู้อำนวยการ',
    'ครูเชี่ยวชาญ',
    'ครูชำนาญการพิเศษ',
    'ครูชำนาญการ',
    'ครู',
    'ครูผู้ช่วย',
    'อัตราจ้าง',
    'พนักงานราชการ'
];

export const DEFAULT_LOCATION = {
    lat: 13.7563,
    lng: 100.5018,
    allowedRadiusMeters: 500
};

// Director Calendar Mocks
export const MOCK_DIRECTOR_EVENTS: DirectorEvent[] = [
    {
        id: 'evt_1',
        schoolId: '31030019',
        title: 'ประชุมผู้บริหาร สพฐ.',
        date: new Date().toISOString().split('T')[0], // Today
        startTime: '09:00',
        endTime: '12:00',
        location: 'สำนักงานเขตพื้นที่การศึกษา',
        description: 'ประชุมวาระพิเศษเรื่องนโยบายการศึกษาใหม่',
        createdBy: 'admin_doc',
        notifiedOneDayBefore: true,
        notifiedOnDay: true
    },
    {
        id: 'evt_2',
        schoolId: '31030019',
        title: 'เป็นประธานเปิดงานกีฬาสี',
        date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], // Tomorrow
        startTime: '08:00',
        location: 'สนามฟุตบอลโรงเรียน',
        createdBy: 'admin_doc',
        notifiedOneDayBefore: true,
        notifiedOnDay: false
    }
];

export const MOCK_DOCUMENTS: DocumentItem[] = [];
export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [];
export const MOCK_ACCOUNTS: FinanceAccount[] = [];
export const MOCK_TRANSACTIONS: Transaction[] = [];
export const MOCK_ATTENDANCE_HISTORY: AttendanceRecord[] = [];
export const MOCK_TEACHERS: Teacher[] = [
    {
        id: 'admin',
        schoolId: '31030019',
        name: 'Admin User',
        position: 'System Admin',
        roles: ['SYSTEM_ADMIN'],
        password: 'password'
    }
];
export const MOCK_SCHOOLS: School[] = [
    {
        id: '31030019',
        name: 'โรงเรียนตัวอย่างวิทยา',
        district: 'เมือง',
        province: 'กรุงเทพมหานคร'
    }
];
export const MOCK_PLAN_DATA: PlanDepartment[] = [];
export const MOCK_ENROLLMENTS: EnrollmentData[] = [];
export const MOCK_TEST_SCORES: TestScoreData[] = [];
