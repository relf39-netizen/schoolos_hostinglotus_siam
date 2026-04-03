
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Calendar, CheckCircle2, XCircle, Clock, AlertCircle, 
    Users, Search, Filter, TrendingUp, Download, 
    Printer, ChevronRight, GraduationCap, Save, 
    ArrowLeft, LayoutDashboard, History, UserCheck,
    Camera, MapPin, Phone, Home, Heart, User, Plus, Trash2,
    Scale, Ruler, Loader, BarChart3, Activity, Edit
} from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { Teacher, Student, StudentAttendance, StudentAttendanceStatus, ClassRoom, AcademicYear, StudentHealthRecord } from '@/types';
import { getDirectDriveUrl } from '@utils/drive';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const formatToISODate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatToThaiDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const d = date.getDate();
    const m = THAI_MONTHS[date.getMonth()];
    const y = date.getFullYear() + 543;
    return `${d} ${m} ${y}`;
};

interface StudentAttendanceSystemProps {
    currentUser: Teacher;
}

const StudentAttendanceSystem: React.FC<StudentAttendanceSystemProps> = ({ currentUser }) => {
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'RECORD' | 'HISTORY' | 'STUDENT_INFO' | 'OVERALL_REPORT' | 'CLASS_REPORT'>('DASHBOARD');
    const [showConfirmModal, setShowConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ show: false, title: '', message: '', onConfirm: () => {} });
    
    const [showAlertModal, setShowAlertModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'warning';
    }>({ show: false, title: '', message: '', type: 'success' });

    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<StudentAttendance[]>([]);
    const [historyAttendance, setHistoryAttendance] = useState<StudentAttendance[]>([]);
    const [classRooms, setClassRooms] = useState<ClassRoom[]>([]);
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [selectedDate, setSelectedDate] = useState<string>(formatToISODate(new Date()));
    const [historyStartDate, setHistoryStartDate] = useState<string>(formatToISODate(new Date(new Date().setDate(new Date().getDate() - 7))));
    const [historyEndDate, setHistoryEndDate] = useState<string>(formatToISODate(new Date()));
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [currentAcademicYear, setCurrentAcademicYear] = useState<string>('');
    
    // Attendance Recording State
    const [tempAttendance, setTempAttendance] = useState<Record<string, StudentAttendanceStatus>>({});
    
    // Statistics State
    const [statsDate, setStatsDate] = useState<string>(formatToISODate(new Date()));
    const [individualStudent, setIndividualStudent] = useState<Student | null>(null);

    // Student Info State
    const [selectedStudentForInfo, setSelectedStudentForInfo] = useState<Student | null>(null);
    const [selectedStudentForAbsenceDetails, setSelectedStudentForAbsenceDetails] = useState<Student | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [healthRecords, setHealthRecords] = useState<StudentHealthRecord[]>([]);
    const [newWeight, setNewWeight] = useState<string>('');
    const [newHeight, setNewHeight] = useState<string>('');
    const [isSavingHealth, setIsSavingHealth] = useState(false);
    const [schoolConfig, setSchoolConfig] = useState<any>(null);
    const [directorName, setDirectorName] = useState<string>('');

    const chartData = useMemo(() => {
        return [...healthRecords].reverse().map(r => ({
            date: new Date(r.recordedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }),
            weight: r.weight,
            height: r.height,
            year: r.academicYear
        }));
    }, [healthRecords]);

    useEffect(() => {
        const fetchConfig = async () => {
            if (!supabase) return;
            
            // Fetch school name from schools table
            const { data: schoolData } = await supabase
                .from('schools')
                .select('name')
                .eq('id', currentUser.schoolId)
                .single();

            const { data } = await supabase.from('school_configs').select('*').eq('school_id', currentUser.schoolId).single();
            if (data) {
                setSchoolConfig({
                    ...data,
                    school_name: schoolData?.name || data.school_name || 'โรงเรียนของท่าน'
                });
            } else if (schoolData) {
                setSchoolConfig({ school_name: schoolData.name });
            }

            // Fetch Director Name
            const { data: teachers } = await supabase
                .from('teachers')
                .select('name, roles, position')
                .eq('school_id', currentUser.schoolId);
            
            if (teachers) {
                const director = teachers.find((t: any) => t.roles?.includes('DIRECTOR')) || 
                                 teachers.find((t: any) => t.roles?.includes('ACTING_DIRECTOR')) ||
                                 teachers.find((t: any) => t.roles?.includes('VICE_DIRECTOR')) ||
                                 teachers.find((t: any) => t.position?.includes('ผู้อำนวยการ'));
                if (director) {
                    setDirectorName(director.name);
                }
            }
        };
        fetchConfig();
    }, [currentUser.schoolId]);

    const [absenceStats, setAbsenceStats] = useState<{studentId: string, name: string, class: string, count: number}[]>([]);
    const [isLoadingStats, setIsLoadingStats] = useState(false);

    const fetchAbsenceStats = async () => {
        if (!supabase) return;
        setIsLoadingStats(true);
        try {
            const { data, error } = await supabase
                .from('student_attendance')
                .select('student_id, students(name, current_class)')
                .eq('status', 'Absent');
            
            if (data) {
                const counts: {[key: string]: {name: string, class: string, count: number}} = {};
                data.forEach((record: any) => {
                    const id = record.student_id;
                    if (!counts[id]) {
                        counts[id] = { 
                            name: record.students?.name || 'Unknown', 
                            class: record.students?.current_class || 'Unknown', 
                            count: 0 
                        };
                    }
                    counts[id].count++;
                });
                const sorted = Object.entries(counts)
                    .map(([id, info]) => ({ studentId: id, ...info }))
                    .sort((a, b) => b.count - a.count)
                    .filter(s => s.count >= 3); // Threshold for "frequent"
                setAbsenceStats(sorted);
            }
        } catch (err) {
            console.error("Error fetching absence stats:", err);
        } finally {
            setIsLoadingStats(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'DASHBOARD') {
            fetchAbsenceStats();
        }
    }, [viewMode, currentUser.schoolId]);

    const handlePhotoUpload = async (file: File) => {
        if (!schoolConfig?.script_url || !schoolConfig?.drive_folder_id) {
            setShowAlertModal({
                show: true,
                title: 'ตั้งค่า Google Drive',
                message: 'กรุณาให้ผู้ดูแลระบบตั้งค่า Google Drive ในหน้าตั้งค่าก่อน',
                type: 'warning'
            });
            return;
        }

        setIsUploadingPhoto(true);
        try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
                reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
                reader.readAsDataURL(file);
            });

            const base64Data = await base64Promise;
            const payload = {
                folderId: schoolConfig.drive_folder_id,
                fileName: `student_${Date.now()}_${file.name}`,
                mimeType: file.type,
                fileData: base64Data
            };

            const response = await fetch(schoolConfig.script_url, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                if (responseText.trim().startsWith('error:')) {
                    throw new Error(responseText.trim().replace('error:', '').trim());
                }
                throw new Error("Server returned invalid JSON response");
            }
            if (result.status === 'success') {
                setSelectedStudentForInfo(prev => prev ? { ...prev, photoUrl: result.viewUrl } : null);
            } else {
                throw new Error(result.message || "Upload failed");
            }
        } catch (err: any) {
            setShowAlertModal({
                show: true,
                title: 'อัปโหลดล้มเหลว',
                message: "อัปโหลดรูปภาพล้มเหลว: " + err.message,
                type: 'error'
            });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleGetStudentLocation = () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setSelectedStudentForInfo(prev => prev ? { ...prev, location: loc } : null);
        }, (err) => {
            setShowAlertModal({
                show: true,
                title: 'พิกัดล้มเหลว',
                message: "ไม่สามารถดึงพิกัดได้: " + err.message,
                type: 'error'
            });
        });
    };

    const fetchHealthRecords = async (studentId: string) => {
        if (!supabase) return;
        const { data } = await supabase
            .from('student_health_records')
            .select('*')
            .eq('student_id', studentId)
            .order('recorded_at', { ascending: false });
        
        if (data) {
            setHealthRecords(data.map((r: any) => ({
                id: r.id,
                studentId: r.student_id,
                schoolId: r.school_id,
                weight: r.weight,
                height: r.height,
                recordedDate: r.recorded_at, // Map to recordedDate to match types.ts
                academicYear: r.academic_year,
                recordedBy: r.recorded_by,
                createdAt: r.created_at
            })));
        }
    };

    const handleSaveStudentInfo = async () => {
        if (!selectedStudentForInfo || !supabase) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('students')
                .update({
                    photo_url: selectedStudentForInfo.photoUrl,
                    address: selectedStudentForInfo.address,
                    phone_number: selectedStudentForInfo.phoneNumber,
                    father_name: selectedStudentForInfo.fatherName,
                    mother_name: selectedStudentForInfo.motherName,
                    guardian_name: selectedStudentForInfo.guardianName,
                    medical_conditions: selectedStudentForInfo.medicalConditions,
                    family_annual_income: selectedStudentForInfo.familyAnnualIncome,
                    lat: selectedStudentForInfo.location?.lat,
                    lng: selectedStudentForInfo.location?.lng
                })
                .eq('id', selectedStudentForInfo.id);
            
            if (error) throw error;
            
            // Update local state
            setStudents(prev => prev.map(s => s.id === selectedStudentForInfo.id ? selectedStudentForInfo : s));
            setShowAlertModal({
                show: true,
                title: 'สำเร็จ',
                message: 'บันทึกข้อมูลสำเร็จ',
                type: 'success'
            });
        } catch (err: any) {
            setShowAlertModal({
                show: true,
                title: 'ขัดข้อง',
                message: 'ขัดข้อง: ' + err.message,
                type: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddHealthRecord = async () => {
        if (!selectedStudentForInfo || !newWeight || !newHeight || !supabase) return;
        setIsSavingHealth(true);
        try {
            const { error } = await supabase
                .from('student_health_records')
                .insert([{
                    student_id: selectedStudentForInfo.id,
                    school_id: currentUser.schoolId,
                    weight: parseFloat(newWeight),
                    height: parseFloat(newHeight),
                    recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    academic_year: currentAcademicYear,
                    recorded_by: currentUser.id
                }]);
            
            if (error) throw error;
            
            setNewWeight('');
            setNewHeight('');
            fetchHealthRecords(selectedStudentForInfo.id);
        } catch (err: any) {
            setShowAlertModal({
                show: true,
                title: 'ขัดข้อง',
                message: 'ขัดข้อง: ' + err.message,
                type: 'error'
            });
        } finally {
            setIsSavingHealth(false);
        }
    };

    const handleDeleteHealthRecord = async (id: string) => {
        setShowConfirmModal({
            show: true,
            title: 'ยืนยันการลบ',
            message: 'ยืนยันลบข้อมูลสุขภาพ?',
            onConfirm: async () => {
                setShowConfirmModal({ ...showConfirmModal, show: false });
                if (!supabase) return;
                try {
                    const { error } = await supabase.from('student_health_records').delete().eq('id', id);
                    if (error) throw error;
                    setShowAlertModal({
                        show: true,
                        title: 'สำเร็จ',
                        message: 'ลบข้อมูลสำเร็จ',
                        type: 'success'
                    });
                    if (selectedStudentForInfo) fetchHealthRecords(selectedStudentForInfo.id);
                } catch (err: any) {
                    setShowAlertModal({
                        show: true,
                        title: 'ขัดข้อง',
                        message: 'ขัดข้อง: ' + err.message,
                        type: 'error'
                    });
                }
            }
        });
    };

    const openStudentInfo = (student: Student) => {
        setSelectedStudentForInfo(student);
        fetchHealthRecords(student.id);
        setViewMode('STUDENT_INFO');
    };

    const isAdmin = (currentUser.roles || []).includes('SYSTEM_ADMIN') || (currentUser.roles || []).includes('ADMIN') || (currentUser.roles || []).includes('DIRECTOR') || (currentUser.roles || []).includes('VICE_DIRECTOR');
    const isDirector = (currentUser.roles || []).includes('DIRECTOR') || (currentUser.roles || []).includes('VICE_DIRECTOR');

    const filteredClassRooms = useMemo(() => {
        if (isAdmin) return classRooms;
        // If teacher has no assigned classes, let them see all classes for now to avoid "empty screen"
        if (!currentUser.assignedClasses || currentUser.assignedClasses.length === 0) return classRooms;
        return classRooms.filter(c => currentUser.assignedClasses?.includes(c.name));
    }, [classRooms, isAdmin, currentUser.assignedClasses]);

    useEffect(() => {
        fetchInitialData();
    }, [currentUser.schoolId]);

    useEffect(() => {
        if (filteredClassRooms.length > 0 && !selectedClass) {
            setSelectedClass(filteredClassRooms[0].name);
        }
    }, [filteredClassRooms]);

    const fetchInitialData = async () => {
        if (!supabase) return;
        setIsLoading(true);
        try {
            // 1. Fetch Academic Years
            const { data: yearsData } = await supabase
                .from('academic_years')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .order('year', { ascending: false });
            
            let currentYear = '';
            if (yearsData) {
                setAcademicYears(yearsData);
                const current = yearsData.find((y: any) => y.isCurrent);
                if (current) {
                    currentYear = current.year;
                    setCurrentAcademicYear(currentYear);
                }
            }

            // 2. Fetch Students first to derive classes if needed
            console.log(`Fetching students for school_id: ${currentUser.schoolId}`);
            const { data: studentsData, error: studentsError } = await supabase
                .from('students')
                .select('*')
                .eq('school_id', currentUser.schoolId);
            
            if (studentsError) {
                console.error("Error fetching students:", studentsError);
                throw new Error(`ไม่สามารถดึงข้อมูลนักเรียนได้: ${studentsError.message}`);
            }

            console.log(`Fetched students:`, studentsData?.length || 0);
            
            let mappedStudents: Student[] = [];
            if (studentsData) {
                mappedStudents = studentsData.map((s: any) => ({
                    ...s,
                    location: (s.lat && s.lng) ? { lat: s.lat, lng: s.lng } : undefined
                }));
                setStudents(mappedStudents);
            }

            // 3. Fetch Classrooms
            const { data: classesData } = await supabase
                .from('class_rooms')
                .select('*')
                .eq('school_id', currentUser.schoolId);
            
            let mappedClasses: ClassRoom[] = [];
            if (classesData && classesData.length > 0) {
                mappedClasses = classesData;
            } else if (mappedStudents.length > 0) {
                // Derive classes from students if class_rooms table is empty
                const uniqueClasses = [...new Set(mappedStudents.map((s: Student) => s.currentClass))].filter(Boolean);
                mappedClasses = uniqueClasses.map((className, index) => ({
                    id: `gen-${index}`,
                    schoolId: currentUser.schoolId,
                    name: className as string,
                    academicYear: currentYear
                }));
            }
            
            setClassRooms(mappedClasses);
            
            // Auto-select class
            const filtered = (isAdmin || !currentUser.assignedClasses || currentUser.assignedClasses.length === 0)
                ? mappedClasses 
                : mappedClasses.filter(c => currentUser.assignedClasses?.includes(c.name));

            if (filtered.length > 0) {
                setSelectedClass(filtered[0].name);
            } else if (mappedClasses.length > 0) {
                setSelectedClass(mappedClasses[0].name);
            }

            // 4. Fetch Today's Attendance
            fetchAttendance(formatToISODate(new Date()));

        } catch (error) {
            console.error('Error fetching initial attendance data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async () => {
        if (!supabase || !selectedClass) return;
        setIsLoadingHistory(true);
        try {
            const { data, error } = await supabase
                .from('student_attendance')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .gte('date', historyStartDate)
                .lte('date', historyEndDate);
            
            if (error) throw error;
            if (data) {
                setHistoryAttendance(data.map((a: any) => ({
                    ...a,
                    date: typeof a.date === 'string' ? a.date.split('T')[0] : formatToISODate(new Date(a.date))
                })));
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'HISTORY') {
            fetchHistory();
        }
    }, [viewMode, historyStartDate, historyEndDate, selectedClass]);

    const historyStats = useMemo(() => {
        const classStudents = students.filter(s => s.currentClass === selectedClass);
        const dates = [...new Set(historyAttendance.map(a => a.date))].sort((a, b) => b.localeCompare(a));
        
        return dates.map(date => {
            const dayAttendance = historyAttendance.filter(a => a.date === date && classStudents.some(s => s.id === a.studentId));
            return {
                date,
                present: dayAttendance.filter(a => a.status === 'Present').length,
                late: dayAttendance.filter(a => a.status === 'Late').length,
                sick: dayAttendance.filter(a => a.status === 'Sick').length,
                absent: dayAttendance.filter(a => a.status === 'Absent').length,
                total: classStudents.length,
                recorded: dayAttendance.length
            };
        });
    }, [historyAttendance, students, selectedClass]);

    const fetchAttendance = async (date: string) => {
        if (!supabase || !currentUser?.schoolId) return;
        
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_attendance')
                .select('*')
                .eq('school_id', String(currentUser.schoolId))
                .eq('date', date);
            
            if (error) throw error;
            
            if (data) {
                const normalizedData = data.map((a: any) => ({
                    ...a,
                    date: typeof a.date === 'string' ? a.date.split('T')[0] : formatToISODate(new Date(a.date))
                }));
                setAttendance(normalizedData);
            }
        } catch (error: any) {
            console.error('Error fetching attendance:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDateChange = (date: string) => {
        setSelectedDate(date);
        fetchAttendance(date);
    };

    const initRecordMode = () => {
        // Initialize temp attendance with existing data or default 'Present'
        const initial: Record<string, StudentAttendanceStatus> = {};
        const classStudents = students.filter(s => s.currentClass === selectedClass);
        
        classStudents.forEach(s => {
            const existing = attendance.find(a => {
                const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : a.date;
                const sDate = selectedDate.split('T')[0];
                return a.studentId.toLowerCase() === s.id.toLowerCase() && aDate === sDate;
            });
            initial[s.id] = existing ? existing.status : 'Present';
        });
        
        setTempAttendance(initial);
        setViewMode('RECORD');
    };

    const saveAttendance = async () => {
        if (!supabase) return;
        
        if (!currentAcademicYear) {
            setShowAlertModal({
                show: true,
                title: 'ไม่พบปีการศึกษา',
                message: 'ไม่พบปีการศึกษาปัจจุบัน กรุณาตั้งค่าปีการศึกษาในหน้าจัดการข้อมูล (Manage Academic Years) และเลือกปีปัจจุบันก่อน',
                type: 'warning'
            });
            return;
        }

        // Check if attendance already exists for this class and date
        const classStudents = students.filter(s => s.currentClass === selectedClass);
        const existingRecords = attendance.filter(a => 
            a.date === selectedDate && 
            classStudents.some(s => s.id === a.studentId)
        );

        if (existingRecords.length > 0) {
            setShowConfirmModal({
                show: true,
                title: 'ยืนยันการบันทึกทับข้อมูล',
                message: `คุณเคยบันทึกข้อมูลการมาเรียนของชั้น ${selectedClass} ในวันที่ ${formatToThaiDate(selectedDate)} ไปแล้ว \n\nคุณต้องการบันทึกทับข้อมูลเดิมใช่หรือไม่?`,
                onConfirm: () => executeSave(existingRecords)
            });
        } else {
            executeSave([]);
        }
    };

    const executeSave = async (existingRecords: any[]) => {
        setShowConfirmModal({ ...showConfirmModal, show: false });
        setIsSaving(true);
        try {
            const records = Object.entries(tempAttendance).map(([studentId, status]) => {
                const existing = existingRecords.find(e => e.student_id.toLowerCase() === studentId.toLowerCase());
                return {
                    id: existing ? existing.id : undefined,
                    school_id: currentUser.schoolId,
                    student_id: studentId,
                    date: selectedDate,
                    status: status,
                    academic_year: currentAcademicYear,
                    created_by: currentUser.id
                };
            });

            if (records.length === 0) {
                setShowAlertModal({
                    show: true,
                    title: 'ไม่พบข้อมูล',
                    message: 'ไม่พบรายชื่อนักเรียนที่จะบันทึก',
                    type: 'warning'
                });
                setIsSaving(false);
                return;
            }

            // Send in chunks to avoid payload size issues
            const chunkSize = 5; // Small chunks
            for (let i = 0; i < records.length; i += chunkSize) {
                const chunk = records.slice(i, i + chunkSize);
                console.log(`Saving attendance chunk ${i/chunkSize + 1}...`, chunk);
                
                const { error } = await supabase
                    .from('student_attendance')
                    .upsert(chunk, { onConflict: 'student_id, date' });

                if (error) {
                    console.error('Upsert error at chunk:', i, error);
                    throw error;
                }
            }
            
            setShowAlertModal({
                show: true,
                title: 'สำเร็จ',
                message: 'บันทึกข้อมูลการมาเรียนเรียบร้อยแล้ว',
                type: 'success'
            });
            await fetchAttendance(selectedDate);
            setViewMode('DASHBOARD');
        } catch (error: any) {
            console.error('Error saving attendance:', error);
            // Provide more detailed error info
            const errorMsg = error.message || error.details || 'Unknown error';
            const errorCode = error.code ? `(Code: ${error.code})` : '';
            setShowAlertModal({
                show: true,
                title: 'เกิดข้อผิดพลาด',
                message: `เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${errorMsg} ${errorCode}`,
                type: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const overallStats = useMemo(() => {
        const statsByClass: Record<string, {
            present: number,
            late: number,
            sick: number,
            absent: number,
            total: number,
            recorded: number
        }> = {};

        classRooms.forEach(cls => {
            const classStudents = students.filter(s => s.currentClass === cls.name);
            const classAttendance = attendance.filter(a => {
                const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : a.date;
                const sDate = selectedDate.split('T')[0];
                return aDate === sDate && classStudents.some(s => s.id.toLowerCase() === a.studentId.toLowerCase());
            });
            
            statsByClass[cls.name] = {
                present: classAttendance.filter(a => a.status === 'Present').length,
                late: classAttendance.filter(a => a.status === 'Late').length,
                sick: classAttendance.filter(a => a.status === 'Sick').length,
                absent: classAttendance.filter(a => a.status === 'Absent').length,
                total: classStudents.length,
                recorded: classAttendance.length
            };
        });

        return statsByClass;
    }, [students, attendance, classRooms]);

    const studentAbsenceCounts = useMemo(() => {
        const counts: Record<string, { count: number, dates: string[] }> = {};
        
        // Combine current attendance and history
        const allAttendance = [...attendance, ...historyAttendance];
        
        allAttendance.forEach(a => {
            if (a.status === 'Absent') {
                if (!counts[a.studentId]) {
                    counts[a.studentId] = { count: 0, dates: [] };
                }
                // Avoid duplicate dates if they overlap
                if (!counts[a.studentId].dates.includes(a.date)) {
                    counts[a.studentId].count++;
                    counts[a.studentId].dates.push(a.date);
                }
            }
        });
        
        return counts;
    }, [attendance, historyAttendance]);

    const handlePrint = () => {
        window.print();
    };

    const dailyStats = useMemo(() => {
        const classStudents = students.filter(s => s.currentClass === selectedClass);
        // Normalize dates for comparison to avoid timezone or format mismatches
        const classAttendance = attendance.filter(a => {
            const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : a.date;
            const sDate = selectedDate.split('T')[0];
            return aDate === sDate && classStudents.some(s => s.id.toLowerCase() === a.studentId.toLowerCase());
        });
        
        const stats = {
            present: classAttendance.filter(a => a.status === 'Present').length,
            late: classAttendance.filter(a => a.status === 'Late').length,
            sick: classAttendance.filter(a => a.status === 'Sick').length,
            absent: classAttendance.filter(a => a.status === 'Absent').length,
            total: classStudents.length,
            recorded: classAttendance.length
        };
        
        return stats;
    }, [students, attendance, selectedClass, selectedDate]);

    const studentHistory = useMemo(() => {
        if (!individualStudent) return [];
        // This would ideally fetch from DB for all dates, but for now we use what's loaded
        // In a real app, we'd fetch specific history for the student
        return attendance.filter(a => a.studentId === individualStudent.id).sort((a,b) => b.date.localeCompare(a.date));
    }, [individualStudent, attendance]);

    const getStatusColor = (status: StudentAttendanceStatus) => {
        switch(status) {
            case 'Present': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Late': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Sick': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Absent': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getStatusIcon = (status: StudentAttendanceStatus) => {
        switch(status) {
            case 'Present': return <CheckCircle2 size={16} />;
            case 'Late': return <Clock size={16} />;
            case 'Sick': return <AlertCircle size={16} />;
            case 'Absent': return <XCircle size={16} />;
        }
    };

    const getStatusLabel = (status: StudentAttendanceStatus) => {
        switch(status) {
            case 'Present': return 'มาเรียน';
            case 'Late': return 'สาย';
            case 'Sick': return 'ลาป่วย/ธุระ';
            case 'Absent': return 'ขาดเรียน';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <TrendingUp className="animate-bounce text-indigo-500" size={48} />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 font-sarabun">
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0.2cm 1.5cm;
                    }
                    body {
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                    }
                    .print-hidden {
                        display: none !important;
                    }
                    .print-visible {
                        display: block !important;
                    }
                    /* Hide main app navigation/header if they exist outside this component */
                    header, nav, footer, aside {
                        display: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}} />
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 print:hidden">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                        <UserCheck size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">ระบบดูแลช่วยเหลือนักเรียน</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Student Support Management System</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                    <Calendar className="text-indigo-500 ml-2" size={20} />
                    <input 
                        type="date" 
                        className="bg-transparent border-none focus:ring-0 font-black text-slate-700"
                        value={selectedDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                    />
                </div>
            </div>

            {viewMode === 'DASHBOARD' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-100">
                            <p className="text-emerald-100 text-xs font-black uppercase tracking-widest">มาเรียน</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.present} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-3xl text-white shadow-lg shadow-amber-100">
                            <p className="text-amber-100 text-xs font-black uppercase tracking-widest">สาย</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.late} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-3xl text-white shadow-lg shadow-blue-100">
                            <p className="text-blue-100 text-xs font-black uppercase tracking-widest">ลา</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.sick} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                        <div className="bg-gradient-to-br from-rose-500 to-pink-600 p-6 rounded-3xl text-white shadow-lg shadow-rose-100">
                            <p className="text-rose-100 text-xs font-black uppercase tracking-widest">ขาด</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.absent} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                    </div>

                    {/* Quick Navigation */}
                    <div className="flex flex-wrap gap-4">
                        <button 
                            onClick={() => setViewMode('OVERALL_REPORT')}
                            className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3 hover:bg-slate-50 transition-all shadow-sm group"
                        >
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                <LayoutDashboard size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-black text-slate-700 text-sm">รายงานภาพรวมโรงเรียน</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Overall School Report</p>
                            </div>
                        </button>
                        <button 
                            onClick={() => setViewMode('HISTORY')}
                            className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3 hover:bg-slate-50 transition-all shadow-sm group"
                        >
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all">
                                <History size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-black text-slate-700 text-sm">ประวัติการมาเรียน</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Attendance History</p>
                            </div>
                        </button>
                    </div>

                    {/* Main Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                                    <Users className="text-indigo-500" /> รายชื่อนักเรียนชั้น {selectedClass}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setViewMode('CLASS_REPORT')}
                                        className="bg-white border border-slate-200 p-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 text-xs font-black"
                                        title="พิมพ์รายงานบันทึกข้อความ"
                                    >
                                        <Printer size={16} /> รายงานทางการ
                                    </button>
                                    <select 
                                        className="bg-slate-50 border-none rounded-xl font-bold text-slate-600 text-sm"
                                        value={selectedClass}
                                        onChange={(e) => setSelectedClass(e.target.value)}
                                    >
                                        <option value="">-- เลือกชั้นเรียน --</option>
                                        {filteredClassRooms.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={initRecordMode}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-black transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                                    >
                                        <Save size={18} /> บันทึกการมาเรียน
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {students.filter(s => s.currentClass === selectedClass).length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 italic">ไม่พบรายชื่อนักเรียนในชั้นนี้</div>
                                ) : (
                                    students.filter(s => s.currentClass === selectedClass).map((student, idx) => {
                                        const record = attendance.find(a => {
                                            const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : a.date;
                                            const sDate = selectedDate.split('T')[0];
                                            return a.studentId.toLowerCase() === student.id.toLowerCase() && aDate === sDate;
                                        });
                                        const absenceData = studentAbsenceCounts[student.id];
                                        return (
                                            <div key={student.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs font-black text-slate-300 w-6">{idx + 1}</span>
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-indigo-500 shadow-sm border border-slate-100 overflow-hidden">
                                                        {student.photoUrl ? (
                                                            <img src={getDirectDriveUrl(student.photoUrl)} className="w-full h-full object-cover" alt={student.name} referrerPolicy="no-referrer" />
                                                        ) : (
                                                            student.name[0]
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-700">{student.name}</p>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {student.id.slice(0,8)}</p>
                                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black border border-indigo-100 uppercase tracking-tighter">ชั้น {student.currentClass}</span>
                                                            {absenceData && absenceData.count > 0 && (
                                                                <button 
                                                                    onClick={() => setSelectedStudentForAbsenceDetails(student)}
                                                                    className="text-[10px] font-black bg-rose-100 text-rose-700 px-3 py-1 rounded-full hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-rose-200"
                                                                >
                                                                    <AlertCircle size={12} />
                                                                    ขาดเรียน {absenceData.count} ครั้ง
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {record ? (
                                                        <div className={`px-4 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${getStatusColor(record.status)}`}>
                                                            {getStatusIcon(record.status)}
                                                            {getStatusLabel(record.status)}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-300 italic">ยังไม่ได้บันทึก</span>
                                                    )}
                                                    <button 
                                                        onClick={() => openStudentInfo(student)}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm group/btn"
                                                        title="แก้ไขข้อมูลนักเรียน"
                                                    >
                                                        <Edit size={14} className="group-hover/btn:scale-110 transition-transform" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">แก้ไข</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => openStudentInfo(student)}
                                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                        title="ดูรายละเอียด"
                                                    >
                                                        <ChevronRight size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Quick Stats Card */}
                            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                <h3 className="font-black text-lg text-slate-800 mb-6 flex items-center gap-2">
                                    <TrendingUp className="text-indigo-500" /> สรุปภาพรวมวันนี้
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-500">นักเรียนทั้งหมด</span>
                                        <span className="font-black text-slate-800">{dailyStats.total} คน</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-500">บันทึกแล้ว</span>
                                        <span className="font-black text-indigo-600">{dailyStats.recorded} / {dailyStats.total}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-indigo-500 h-full transition-all duration-500" 
                                            style={{ width: `${(dailyStats.recorded / dailyStats.total) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            {/* Frequent Absence Stats */}
                            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                <h3 className="font-black text-lg text-slate-800 mb-6 flex items-center gap-2">
                                    <AlertCircle className="text-rose-500" /> นักเรียนที่ขาดเรียนบ่อย (3 ครั้ง+)
                                </h3>
                                <div className="space-y-3">
                                    {isLoadingStats ? (
                                        <div className="py-10 text-center animate-pulse text-slate-300 font-bold italic text-xs">กำลังวิเคราะห์ข้อมูล...</div>
                                    ) : absenceStats.length === 0 ? (
                                        <div className="py-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                            <CheckCircle2 className="text-emerald-400 mx-auto mb-2" size={24}/>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">ไม่มีนักเรียนขาดเรียนบ่อย</p>
                                        </div>
                                    ) : (
                                        absenceStats.map(stat => (
                                            <div key={stat.studentId} className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex justify-between items-center group hover:bg-rose-100 transition-all">
                                                <div>
                                                    <p className="font-bold text-rose-900 text-xs leading-none mb-1">{stat.name}</p>
                                                    <p className="text-[9px] text-rose-600 font-bold uppercase tracking-widest">{stat.class}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-black text-rose-600 leading-none">{stat.count}</p>
                                                    <p className="text-[8px] text-rose-400 font-black uppercase">ครั้ง</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Info Card */}
                            <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                                <div className="flex items-center gap-3 mb-4">
                                    <AlertCircle className="text-indigo-500" />
                                    <h4 className="font-black text-indigo-900">คำแนะนำ</h4>
                                </div>
                                <p className="text-sm text-indigo-700 leading-relaxed font-medium">
                                    คุณครูประจำชั้นควรบันทึกข้อมูลการมาเรียนก่อนเวลา 08:30 น. เพื่อให้ระบบสรุปสถิติภาพรวมของโรงเรียนได้อย่างถูกต้อง
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'RECORD' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-8 border-b pb-6 border-slate-50">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setViewMode('DASHBOARD')} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-all">
                                    <ArrowLeft size={24} />
                                </button>
                                <div>
                                    <h3 className="font-black text-xl text-slate-800">บันทึกการมาเรียน: ชั้น {selectedClass}</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">วันที่ {formatToThaiDate(selectedDate)}</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setViewMode('DASHBOARD')}
                                    className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl font-black text-sm hover:bg-slate-200 transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button 
                                    onClick={saveAttendance}
                                    disabled={isSaving}
                                    className="px-8 py-2 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                                >
                                    {isSaving ? <TrendingUp className="animate-spin" size={18} /> : <Save size={18} />}
                                    บันทึกทั้งหมด
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {students.filter(s => s.currentClass === selectedClass).map((student, idx) => (
                                <div key={student.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 gap-4">
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-black text-slate-300 w-8">{idx + 1}</span>
                                                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-indigo-500 shadow-sm border border-slate-100 text-xl overflow-hidden">
                                                        {student.photoUrl ? (
                                                            <img src={getDirectDriveUrl(student.photoUrl)} className="w-full h-full object-cover" alt={student.name} referrerPolicy="no-referrer" />
                                                        ) : (
                                                            student.name[0]
                                                        )}
                                                    </div>
                                        <div>
                                            <p className="font-black text-slate-800 text-lg">{student.name}</p>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ID: {student.id.slice(0,8)}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(['Present', 'Late', 'Sick', 'Absent'] as StudentAttendanceStatus[]).map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setTempAttendance(prev => ({ ...prev, [student.id]: status }))}
                                                className={`flex-1 md:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${
                                                    tempAttendance[student.id] === status 
                                                        ? getStatusColor(status).replace('bg-', 'bg-').replace('text-', 'text-') + ' border-current shadow-md'
                                                        : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                                                }`}
                                            >
                                                {getStatusIcon(status)}
                                                {getStatusLabel(status)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {viewMode === 'STUDENT_INFO' && selectedStudentForInfo && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center gap-4 mb-6">
                        <button 
                            onClick={() => setViewMode('DASHBOARD')}
                            className="p-3 bg-white text-slate-600 rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h3 className="text-xl font-black text-slate-800">ข้อมูลพื้นฐานนักเรียน</h3>
                            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Student Information & Health Records</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Student Profile Card */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                <div className="flex flex-col md:flex-row gap-8">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-40 h-52 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group shadow-inner">
                                            {selectedStudentForInfo.photoUrl ? (
                                                <img src={getDirectDriveUrl(selectedStudentForInfo.photoUrl)} className="w-full h-full object-cover" alt="Student" referrerPolicy="no-referrer" />
                                            ) : (
                                                <div className="text-center">
                                                    <User size={48} className="text-slate-200 mx-auto mb-2"/>
                                                    <p className="text-[10px] text-slate-300 font-bold uppercase">No Photo</p>
                                                </div>
                                            )}
                                            {isUploadingPhoto && (
                                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                                    <Loader className="animate-spin text-indigo-600" size={24}/>
                                                </div>
                                            )}
                                        </div>
                                        <label className="cursor-pointer px-6 py-2 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2">
                                            <Camera size={14}/> {selectedStudentForInfo.photoUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                                            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}/>
                                        </label>
                                        <p className="text-[9px] text-slate-400 font-bold text-center leading-tight">
                                            แนะนำ: 300 x 400 px<br/>(แนวตั้ง 3:4)
                                        </p>
                                    </div>

                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ชื่อ-นามสกุล</label>
                                            <div className="p-3 bg-slate-50 border rounded-xl font-black text-slate-800">{selectedStudentForInfo.name}</div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ชั้นเรียน</label>
                                            <div className="p-3 bg-slate-50 border rounded-xl font-black text-slate-800">{selectedStudentForInfo.currentClass}</div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">เบอร์โทรศัพท์</label>
                                            <input type="text" value={selectedStudentForInfo.phoneNumber || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, phoneNumber: e.target.value} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm"/>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">โรคประจำตัว / แพ้อาหาร</label>
                                            <input type="text" value={selectedStudentForInfo.medicalConditions || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, medicalConditions: e.target.value} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm" placeholder="ถ้าไม่มีให้เว้นว่าง"/>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">รายได้รวมของครอบครัวต่อปี (บาท)</label>
                                            <input type="number" value={selectedStudentForInfo.familyAnnualIncome || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, familyAnnualIncome: parseFloat(e.target.value) || 0} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm" placeholder="ระบุจำนวนเงิน"/>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ที่อยู่ติดต่อ</label>
                                            <textarea value={selectedStudentForInfo.address || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, address: e.target.value} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm h-24 resize-none"/>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">พิกัดบ้าน (GPS)</label>
                                            <div className="flex gap-2 mb-3">
                                                <input type="text" readOnly value={selectedStudentForInfo.location ? `${selectedStudentForInfo.location.lat.toFixed(6)}, ${selectedStudentForInfo.location.lng.toFixed(6)}` : 'ยังไม่ได้ระบุ'} className="flex-1 p-3 bg-slate-50 border rounded-xl font-mono text-[10px] font-bold outline-none"/>
                                                <button onClick={handleGetStudentLocation} className="px-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"><MapPin size={18}/> ดึงพิกัด</button>
                                            </div>
                                            {selectedStudentForInfo.location && (
                                                <div className="w-full h-48 rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
                                                    <iframe 
                                                        width="100%" 
                                                        height="100%" 
                                                        frameBorder="0" 
                                                        style={{ border: 0 }}
                                                        src={`https://www.google.com/maps?q=${selectedStudentForInfo.location.lat},${selectedStudentForInfo.location.lng}&z=15&output=embed`}
                                                        allowFullScreen
                                                    ></iframe>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-8 border-t border-slate-100">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ชื่อบิดา</label>
                                        <input type="text" value={selectedStudentForInfo.fatherName || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, fatherName: e.target.value} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm"/>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ชื่อมารดา</label>
                                        <input type="text" value={selectedStudentForInfo.motherName || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, motherName: e.target.value} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm"/>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ชื่อผู้ปกครอง</label>
                                        <input type="text" value={selectedStudentForInfo.guardianName || ''} onChange={e => setSelectedStudentForInfo(prev => prev ? {...prev, guardianName: e.target.value} : null)} className="w-full p-3 bg-white border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-sm"/>
                                    </div>
                                </div>

                                <div className="mt-8 pt-8 border-t border-slate-100 flex justify-end">
                                    <button 
                                        onClick={handleSaveStudentInfo}
                                        disabled={isSaving}
                                        className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-3 uppercase tracking-widest disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader className="animate-spin" size={20}/> : <Save size={20}/>} บันทึกข้อมูลพื้นฐาน
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Health Records Card */}
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                <h3 className="font-black text-lg text-slate-800 mb-6 flex items-center gap-2">
                                    <Heart className="text-rose-500" /> บันทึกน้ำหนัก-ส่วนสูง
                                </h3>
                                
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">น้ำหนัก (กก.)</label>
                                        <div className="relative">
                                            <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16}/>
                                            <input type="number" value={newWeight} onChange={e => setNewWeight(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl font-black outline-none focus:border-rose-500" placeholder="0.0"/>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ส่วนสูง (ซม.)</label>
                                        <div className="relative">
                                            <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16}/>
                                            <input type="number" value={newHeight} onChange={e => setNewHeight(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl font-black outline-none focus:border-rose-500" placeholder="0"/>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleAddHealthRecord}
                                        disabled={isSavingHealth || !newWeight || !newHeight}
                                        className="col-span-2 py-3 bg-rose-500 text-white rounded-xl font-black shadow-lg hover:bg-rose-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50"
                                    >
                                        {isSavingHealth ? <Loader className="animate-spin" size={18}/> : <Plus size={18}/>} เพิ่มบันทึก
                                    </button>
                                </div>

                                <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                                    {healthRecords.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 italic text-sm">ยังไม่มีบันทึกสุขภาพ</div>
                                    ) : (
                                        healthRecords.map(record => (
                                            <div key={record.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className="text-sm font-black text-slate-700">{record.weight} กก.</span>
                                                        <span className="text-slate-300">|</span>
                                                        <span className="text-sm font-black text-slate-700">{record.height} ซม.</span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        {new Date(record.recordedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={() => handleDeleteHealthRecord(record.id)}
                                                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Growth Chart */}
                            {healthRecords.length > 0 && (
                                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                    <h3 className="font-black text-lg text-slate-800 mb-6 flex items-center gap-2">
                                        <Activity className="text-indigo-500" /> กราฟแสดงการเจริญเติบโต
                                    </h3>
                                    <div className="h-[250px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis 
                                                    dataKey="date" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                                />
                                                <YAxis 
                                                    yAxisId="left"
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                                    width={30}
                                                />
                                                <YAxis 
                                                    yAxisId="right" 
                                                    orientation="right"
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                                    width={30}
                                                />
                                                <Tooltip 
                                                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                                    labelStyle={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.25rem' }}
                                                />
                                                <Legend iconType="circle" wrapperStyle={{ paddingTop: '1rem', fontSize: '10px', fontWeight: 700 }} />
                                                <Line 
                                                    yAxisId="left"
                                                    type="monotone" 
                                                    dataKey="weight" 
                                                    name="น้ำหนัก (กก.)" 
                                                    stroke="#f43f5e" 
                                                    strokeWidth={3} 
                                                    dot={{ r: 4, fill: '#f43f5e', strokeWidth: 2, stroke: '#fff' }}
                                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                                />
                                                <Line 
                                                    yAxisId="right"
                                                    type="monotone" 
                                                    dataKey="height" 
                                                    name="ส่วนสูง (ซม.)" 
                                                    stroke="#6366f1" 
                                                    strokeWidth={3} 
                                                    dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-bold text-center mt-4 uppercase tracking-widest">
                                        เปรียบเทียบแนวโน้มน้ำหนักและส่วนสูงตามช่วงเวลา
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'HISTORY' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setViewMode('DASHBOARD')}
                                className="p-3 bg-white text-slate-600 rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div>
                                <h3 className="text-xl font-black text-slate-800">ประวัติการมาเรียน</h3>
                                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Attendance History & Reports</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 px-3 border-r border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase">ชั้นเรียน:</span>
                                <select 
                                    className="bg-transparent border-none font-black text-slate-700 text-sm focus:ring-0"
                                    value={selectedClass}
                                    onChange={(e) => setSelectedClass(e.target.value)}
                                >
                                    {filteredClassRooms.map(c => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 px-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase">จาก:</span>
                                <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="bg-transparent border-none font-black text-slate-700 text-sm focus:ring-0"/>
                            </div>
                            <div className="flex items-center gap-2 px-3 border-l border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase">ถึง:</span>
                                <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="bg-transparent border-none font-black text-slate-700 text-sm focus:ring-0"/>
                            </div>
                            <button onClick={fetchHistory} className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all">
                                <Search size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                        {isLoadingHistory ? (
                            <div className="py-20 text-center">
                                <Loader className="animate-spin text-indigo-500 mx-auto mb-4" size={32} />
                                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">กำลังโหลดข้อมูลประวัติ...</p>
                            </div>
                        ) : historyStats.length === 0 ? (
                            <div className="py-20 text-center">
                                <History className="text-slate-200 mx-auto mb-4" size={48} />
                                <p className="text-slate-400 font-bold italic">ไม่พบข้อมูลการมาเรียนในช่วงเวลาที่เลือก</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="p-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">วันที่</th>
                                            <th className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">มาเรียน</th>
                                            <th className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">สาย</th>
                                            <th className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">ลา</th>
                                            <th className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">ขาด</th>
                                            <th className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">ร้อยละมาเรียน</th>
                                            <th className="p-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {historyStats.map(stat => {
                                            const attendanceRate = stat.total > 0 ? ((stat.present / stat.total) * 100).toFixed(1) : '0.0';
                                            return (
                                                <tr key={stat.date} className="hover:bg-slate-50 transition-all">
                                                    <td className="p-4 font-black text-slate-700">{formatToThaiDate(stat.date)}</td>
                                                    <td className="p-4 text-center font-bold text-emerald-600">{stat.present}</td>
                                                    <td className="p-4 text-center font-bold text-amber-600">{stat.late}</td>
                                                    <td className="p-4 text-center font-bold text-blue-600">{stat.sick}</td>
                                                    <td className="p-4 text-center font-bold text-rose-600">{stat.absent}</td>
                                                    <td className="p-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                                <div className="bg-indigo-500 h-full" style={{ width: `${attendanceRate}%` }}></div>
                                                            </div>
                                                            <span className="text-xs font-black text-slate-600">{attendanceRate}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedDate(stat.date);
                                                                fetchAttendance(stat.date);
                                                                setViewMode('DASHBOARD');
                                                            }}
                                                            className="text-indigo-600 hover:text-indigo-800 font-black text-[10px] uppercase tracking-widest"
                                                        >
                                                            ดูรายละเอียด
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {viewMode === 'OVERALL_REPORT' && (
                <div className="space-y-6 animate-fade-in print:m-0 print:p-0">
                    <div className="flex justify-between items-center print:hidden">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setViewMode('DASHBOARD')}
                                className="p-3 bg-white text-slate-600 rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div>
                                <h3 className="text-xl font-black text-slate-800">รายงานสรุปการมาเรียนภาพรวม</h3>
                                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Daily Attendance Summary Report</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={handlePrint}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                            >
                                <Printer size={18} /> พิมพ์รายงานสรุปภาพรวม
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-slate-100 print:shadow-none print:border-none print:p-0 print:mt-[-2.5cm] print:text-black font-sarabun">
                        {/* Garuda Emblem */}
                        <div className="flex justify-start mb-0 print:mb-0 print:mt-4">
                            <img 
                                src={schoolConfig?.official_garuda_base_64 ? (schoolConfig.official_garuda_base_64.startsWith('data:') ? schoolConfig.official_garuda_base_64 : `data:image/png;base64,${schoolConfig.official_garuda_base_64}`) : "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Garuda_Emb_of_Thailand.svg/1200px-Garuda_Emb_of_Thailand.svg.png"} 
                                alt="Garuda" 
                                className="h-24 w-auto print:h-20"
                                referrerPolicy="no-referrer"
                            />
                        </div>

                        <div className="text-center mb-2 print:mb-1">
                            <h1 className="text-2xl font-black">บันทึกข้อความ</h1>
                        </div>

                        <div className="space-y-2 mb-6 print:mb-2">
                            <div className="flex items-end">
                                <span className="font-black w-24 shrink-0">ส่วนราชการ</span>
                                <span className="border-b border-dotted border-slate-400 flex-1 text-right sm:text-left overflow-hidden text-ellipsis whitespace-nowrap print:text-sm">
                                    {schoolConfig?.school_name || 'โรงเรียนของท่าน'}
                                </span>
                            </div>
                            <div className="flex">
                                <div className="w-1/2 flex items-end">
                                    <span className="font-black w-8 shrink-0">ที่</span>
                                    <span className="border-b border-dotted border-slate-400 flex-1 mr-4"></span>
                                </div>
                                <div className="w-1/2 flex items-end">
                                    <span className="font-black shrink-0">วันที่</span>
                                    <span className="border-b border-dotted border-slate-400 ml-2 px-2 min-w-[4cm] text-center">
                                        {formatToThaiDate(selectedDate)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-end">
                                <span className="font-black w-12 shrink-0">เรื่อง</span>
                                <span className="border-b border-dotted border-slate-400 flex-1">รายงานสรุปสถิติการมาเรียนของนักเรียนภาพรวมทั้งโรงเรียน ประจำวันที่ {formatToThaiDate(selectedDate)}</span>
                            </div>
                        </div>

                        <div className="mb-6 print:mb-2">
                            <p className="font-black mb-2">เรียน ผู้อำนวยการโรงเรียน{(schoolConfig?.school_name || '').replace(/^โรงเรียน/, '') || '................................................'}</p>
                            
                            <div className="indent-16 leading-relaxed space-y-2">
                                <p>
                                    ตามที่โรงเรียนได้ดำเนินการตรวจสอบการมาเรียนของนักเรียนเป็นประจำทุกวัน เพื่อใช้เป็นข้อมูลในการบริหารจัดการและดูแลช่วยเหลือนักเรียนให้มีประสิทธิภาพนั้น
                                </p>
                                <p>
                                    ในการนี้ ฝ่ายบริหารงานวิชาการ/งานทะเบียน ได้สรุปสถิติการมาเรียนของนักเรียนภาพรวมทั้งโรงเรียน ประจำวันที่ {formatToThaiDate(selectedDate)} ปรากฏรายละเอียดดังนี้
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto mb-12 print:mb-2">
                            <table className="w-full border-collapse border border-black">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="border border-black p-2 text-left text-xs font-black">ระดับชั้น</th>
                                        <th className="border border-black p-2 text-center text-xs font-black">นักเรียนทั้งหมด</th>
                                        <th className="border border-black p-2 text-center text-xs font-black">มาเรียน</th>
                                        <th className="border border-black p-2 text-center text-xs font-black">สาย</th>
                                        <th className="border border-black p-2 text-center text-xs font-black">ลา</th>
                                        <th className="border border-black p-2 text-center text-xs font-black">ขาด</th>
                                        <th className="border border-black p-2 text-center text-xs font-black">ร้อยละมาเรียน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classRooms.map(cls => {
                                        const stats = overallStats[cls.name];
                                        const isRecorded = stats.recorded > 0;
                                        const attendanceRate = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : '0.0';
                                        return (
                                            <tr key={cls.id}>
                                                <td className="border border-black p-2 text-sm">{cls.name}</td>
                                                <td className="border border-black p-2 text-center text-sm">{stats.total}</td>
                                                <td className="border border-black p-2 text-center text-sm">{isRecorded ? stats.present : 0}</td>
                                                <td className="border border-black p-2 text-center text-sm">{isRecorded ? stats.late : 0}</td>
                                                <td className="border border-black p-2 text-center text-sm">{isRecorded ? stats.sick : 0}</td>
                                                <td className="border border-black p-2 text-center text-sm font-black text-rose-600">{isRecorded ? stats.absent : 0}</td>
                                                <td className="border border-black p-2 text-center text-sm">{isRecorded ? attendanceRate : '0.0'}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-slate-50 font-black">
                                    <tr>
                                        <td className="border border-black p-2 text-sm">รวมทั้งหมด</td>
                                        <td className="border border-black p-2 text-center text-sm">
                                            {Object.values(overallStats).reduce((acc, curr) => acc + curr.total, 0)}
                                        </td>
                                        <td className="border border-black p-2 text-center text-sm">
                                            {Object.values(overallStats).reduce((acc, curr) => acc + curr.present, 0)}
                                        </td>
                                        <td className="border border-black p-2 text-center text-sm">
                                            {Object.values(overallStats).reduce((acc, curr) => acc + curr.late, 0)}
                                        </td>
                                        <td className="border border-black p-2 text-center text-sm">
                                            {Object.values(overallStats).reduce((acc, curr) => acc + curr.sick, 0)}
                                        </td>
                                        <td className="border border-black p-2 text-center text-sm text-rose-600">
                                            {Object.values(overallStats).reduce((acc, curr) => acc + curr.absent, 0)}
                                        </td>
                                        <td className="border border-black p-2 text-center text-sm">
                                            {(() => {
                                                const total = Object.values(overallStats).reduce((acc, curr) => acc + curr.total, 0);
                                                const present = Object.values(overallStats).reduce((acc, curr) => acc + curr.present, 0);
                                                return total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
                                            })()}%
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="indent-16 mb-12 print:mb-2">
                            <p>จึงเรียนมาเพื่อโปรดทราบและพิจารณา</p>
                        </div>

                        <div className="flex justify-end mb-8 print:mb-2">
                            <div className="text-center w-64">
                                <p className="mb-6 print:mb-2">ลงชื่อ............................................................</p>
                                <p className="font-black">( {currentUser.name} )</p>
                                <p className="text-sm">ผู้สรุปรายงาน</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'CLASS_REPORT' && (
                <div className="space-y-6 animate-fade-in print:m-0 print:p-0">
                    <div className="flex justify-between items-center print:hidden">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setViewMode('DASHBOARD')}
                                className="p-3 bg-white text-slate-600 rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div>
                                <h3 className="text-xl font-black text-slate-800">รายงานบันทึกข้อความ (ทางการ)</h3>
                                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Official Memo Report</p>
                            </div>
                        </div>
                        <button 
                            onClick={handlePrint}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                        >
                            <Printer size={18} /> พิมพ์บันทึกข้อความ
                        </button>
                    </div>

                    <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-slate-100 print:shadow-none print:border-none print:p-0 print:mt-[-2.5cm] print:text-black font-sarabun">
                        {/* Garuda Emblem */}
                        <div className="flex justify-start mb-0 print:mb-0 print:mt-4">
                            <img 
                                src={schoolConfig?.official_garuda_base_64 ? (schoolConfig.official_garuda_base_64.startsWith('data:') ? schoolConfig.official_garuda_base_64 : `data:image/png;base64,${schoolConfig.official_garuda_base_64}`) : "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Garuda_Emb_of_Thailand.svg/1200px-Garuda_Emb_of_Thailand.svg.png"} 
                                alt="Garuda" 
                                className="h-24 w-auto print:h-20"
                                referrerPolicy="no-referrer"
                            />
                        </div>

                        <div className="text-center mb-2 print:mb-1">
                            <h1 className="text-2xl font-black">บันทึกข้อความ</h1>
                        </div>

                        <div className="space-y-2 mb-6 print:mb-2">
                            <div className="flex items-end">
                                <span className="font-black w-24 shrink-0">ส่วนราชการ</span>
                                <span className="border-b border-dotted border-slate-400 flex-1 text-right sm:text-left overflow-hidden text-ellipsis whitespace-nowrap print:text-sm">
                                    {schoolConfig?.school_name || 'โรงเรียนของท่าน'}
                                </span>
                            </div>
                            <div className="flex">
                                <div className="w-1/2 flex items-end">
                                    <span className="font-black w-8 shrink-0">ที่</span>
                                    <span className="border-b border-dotted border-slate-400 flex-1 mr-4"></span>
                                </div>
                                <div className="w-1/2 flex items-end">
                                    <span className="font-black shrink-0">วันที่</span>
                                    <span className="border-b border-dotted border-slate-400 ml-2 px-2 min-w-[4cm] text-center">
                                        {formatToThaiDate(selectedDate)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-end">
                                <span className="font-black w-12 shrink-0">เรื่อง</span>
                                <span className="border-b border-dotted border-slate-400 flex-1">รายงานการมาโรงเรียนของนักเรียนระดับชั้น {selectedClass} ประจำวันที่ {formatToThaiDate(selectedDate)}</span>
                            </div>
                        </div>

                        <div className="mb-6 print:mb-2">
                            <p className="font-black mb-2">เรียน ผู้อำนวยการโรงเรียน{(schoolConfig?.school_name || '').replace(/^โรงเรียน/, '') || '................................................'}</p>
                            
                            <div className="indent-16 leading-relaxed space-y-2">
                                <p>
                                    ตามที่โรงเรียนได้ดำเนินการตรวจสอบการมาเรียนของนักเรียนประจำวัน เพื่อใช้เป็นข้อมูลในการติดตามและดูแลช่วยเหลือนักเรียนให้มีความพร้อมในการจัดการเรียนการสอนนั้น
                                </p>
                                <p>
                                    ในการนี้ ข้าพเจ้า {currentUser.name} ตำแหน่ง {currentUser.position || 'ครูประจำชั้น'} {selectedClass} ได้สรุปสถิติการมาเรียนของนักเรียนประจำวันที่ {formatToThaiDate(selectedDate)} ปรากฏรายละเอียดดังนี้
                                </p>
                            </div>
                        </div>

                        <div className="mx-auto w-4/5 mb-12 print:mb-2">
                            <table className="w-full border-collapse border border-black">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="border border-black p-2 text-center">รายการ</th>
                                        <th className="border border-black p-2 text-center">จำนวน (คน)</th>
                                        <th className="border border-black p-2 text-center">หมายเหตุ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border border-black p-2">นักเรียนทั้งหมด</td>
                                        <td className="border border-black p-2 text-center">{dailyStats.total}</td>
                                        <td className="border border-black p-2"></td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black p-2">มาเรียน</td>
                                        <td className="border border-black p-2 text-center">{dailyStats.present}</td>
                                        <td className="border border-black p-2"></td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black p-2">สาย</td>
                                        <td className="border border-black p-2 text-center">{dailyStats.late}</td>
                                        <td className="border border-black p-2"></td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black p-2">ลาป่วย/ธุระ</td>
                                        <td className="border border-black p-2 text-center">{dailyStats.sick}</td>
                                        <td className="border border-black p-2"></td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black p-2">ขาดเรียน</td>
                                        <td className="border border-black p-2 text-center text-rose-600 font-black">{dailyStats.absent}</td>
                                        <td className="border border-black p-2"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="indent-16 mb-12 print:mb-2">
                            <p>จึงเรียนมาเพื่อโปรดทราบและพิจารณา</p>
                        </div>

                        <div className="flex justify-end mb-8 print:mb-2">
                            <div className="text-center w-64">
                                <p className="mb-6 print:mb-2">ลงชื่อ............................................................</p>
                                <p className="font-black">( {currentUser.name} )</p>
                                <p className="text-sm">ครูประจำชั้น {selectedClass}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Absence Details Modal */}
            <AnimatePresence>
                {showConfirmModal.show && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                        <AlertCircle size={24} />
                                    </div>
                                    <h3 className="font-black text-slate-800 text-lg">{showConfirmModal.title}</h3>
                                </div>
                                <p className="text-slate-600 font-bold text-sm leading-relaxed mb-8 whitespace-pre-wrap">
                                    {showConfirmModal.message}
                                </p>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => setShowConfirmModal({ ...showConfirmModal, show: false })}
                                        className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button 
                                        onClick={showConfirmModal.onConfirm}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                                    >
                                        ตกลง
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showAlertModal.show && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                        showAlertModal.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                                        showAlertModal.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                                    }`}>
                                        {showAlertModal.type === 'success' ? <CheckCircle2 size={24} /> :
                                         showAlertModal.type === 'error' ? <XCircle size={24} /> : <AlertCircle size={24} />}
                                    </div>
                                    <h3 className="font-black text-slate-800 text-lg">{showAlertModal.title}</h3>
                                </div>
                                <p className="text-slate-600 font-bold text-sm leading-relaxed mb-8">
                                    {showAlertModal.message}
                                </p>
                                <button 
                                    onClick={() => setShowAlertModal({ ...showAlertModal, show: false })}
                                    className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                                >
                                    ตกลง
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {selectedStudentForAbsenceDetails && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                            <AlertCircle size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-800">ประวัติการขาดเรียน</h3>
                                            <p className="text-xs font-bold text-slate-400">{selectedStudentForAbsenceDetails.name}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedStudentForAbsenceDetails(null)}
                                        className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-all"
                                    >
                                        <Plus className="rotate-45" size={24} />
                                    </button>
                                </div>

                                <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                    {studentAbsenceCounts[selectedStudentForAbsenceDetails.id]?.dates.sort((a,b) => b.localeCompare(a)).map(date => (
                                        <div key={date} className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                            <span className="font-black text-rose-900 text-sm">{formatToThaiDate(date)}</span>
                                            <span className="px-3 py-1 bg-rose-600 text-white rounded-full text-[10px] font-black uppercase">ขาดเรียน</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-100">
                                    <div className="bg-indigo-50 p-4 rounded-2xl">
                                        <p className="text-xs text-indigo-700 leading-relaxed">
                                            <span className="font-black">คำแนะนำ:</span> ควรดำเนินการติดตามเยี่ยมนักเรียนที่บ้าน หรือติดต่อผู้ปกครองเพื่อสอบถามสาเหตุและหาแนวทางช่วยเหลือ
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedStudentForAbsenceDetails(null)}
                                        className="w-full mt-4 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                                    >
                                        ปิดหน้าต่าง
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentAttendanceSystem;
