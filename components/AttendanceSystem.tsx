import React, { useState, useEffect, useMemo } from 'react';
import { AttendanceRecord, Teacher, School, LeaveRequest } from '@/types';
import { sendTelegramMessage } from '@utils/telegram';
import { 
    MapPin, Navigation, CheckCircle, LogOut, History, Loader, 
    RefreshCw, AlertTriangle, Clock, Calendar, ShieldCheck, 
    MapPinned, Printer, ArrowLeft, ChevronLeft, ChevronRight, 
    FileText, UserCheck, Users, FileSpreadsheet, CalendarDays, Search
} from 'lucide-react';
import { supabase, isConfigured } from '@/supabaseClient';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getThaiMonthYear = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
};

const getTodayDateStr = () => new Date().toISOString().split('T')[0];

const countWeekdays = (start: string, end: string) => {
    let count = 0;
    const cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
};

interface AttendanceSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool: School; 
}

const AttendanceSystem: React.FC<AttendanceSystemProps> = ({ currentUser, allTeachers, currentSchool }) => {
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [gpsStatus, setGpsStatus] = useState<{ lat: number, lng: number, dist: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    
    const [viewMode, setViewMode] = useState<'MAIN' | 'PRINT_DAILY' | 'SUMMARY_REPORT'>('MAIN');
    const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(getTodayDateStr());
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [isFetchingSummary, setIsFetchingSummary] = useState(false);
    const [summarySortOrder, setSummarySortOrder] = useState<'EARLIEST' | 'NAME'>('NAME');
    const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);
    const [schoolConfig, setSchoolConfig] = useState<any>(null);
    const [selectedTeacherDetails, setSelectedTeacherDetails] = useState<any | null>(null);

    // --- Helper Components ---
    const TeacherDetailsModal = () => {
        if (!selectedTeacherDetails) return null;
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
                <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-fade-in border border-slate-200">
                    <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                        <div>
                            <h3 className="text-2xl font-black">{selectedTeacherDetails.name}</h3>
                            <p className="text-blue-400 font-bold text-xs uppercase tracking-widest mt-1">{selectedTeacherDetails.position}</p>
                        </div>
                        <button 
                            onClick={() => setSelectedTeacherDetails(null)}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"
                        >
                            <ArrowLeft size={24}/>
                        </button>
                    </div>

                    <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8">
                        {/* Summary Stats in Modal */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-green-50 p-4 rounded-3xl text-center border border-green-100">
                                <p className="text-[10px] font-black text-green-600 uppercase mb-1">มาปกติ</p>
                                <p className="text-2xl font-black text-green-700">{selectedTeacherDetails.presentDays}</p>
                            </div>
                            <div className="bg-orange-50 p-4 rounded-3xl text-center border border-orange-100">
                                <p className="text-[10px] font-black text-orange-600 uppercase mb-1">มาสาย</p>
                                <p className="text-2xl font-black text-orange-700">{selectedTeacherDetails.lateDays}</p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-3xl text-center border border-blue-100">
                                <p className="text-[10px] font-black text-blue-600 uppercase mb-1">ลา</p>
                                <p className="text-2xl font-black text-blue-700">{selectedTeacherDetails.leaveDays}</p>
                            </div>
                            <div className="bg-red-50 p-4 rounded-3xl text-center border border-red-100">
                                <p className="text-[10px] font-black text-red-600 uppercase mb-1">ขาด</p>
                                <p className="text-2xl font-black text-red-700">{selectedTeacherDetails.absentDays}</p>
                            </div>
                        </div>

                        {/* Detailed Date Lists */}
                        <div className="space-y-6">
                            {selectedTeacherDetails.lateDatesList?.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-black text-orange-600 flex items-center gap-2 text-sm uppercase tracking-widest">
                                        <Clock size={16}/> วันที่มาสาย
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedTeacherDetails.lateDatesList.map((date: string) => (
                                            <span key={date} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                                                {getThaiDate(date)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedTeacherDetails.leaveDatesList?.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-black text-blue-600 flex items-center gap-2 text-sm uppercase tracking-widest">
                                        <Calendar size={16}/> วันที่ลา
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedTeacherDetails.leaveDatesList.map((date: string) => (
                                            <span key={date} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                                {getThaiDate(date)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedTeacherDetails.absentDatesList?.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-black text-red-600 flex items-center gap-2 text-sm uppercase tracking-widest">
                                        <AlertTriangle size={16}/> วันที่ขาดงาน
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedTeacherDetails.absentDatesList.map((date: string) => (
                                            <span key={date} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                                                {getThaiDate(date)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedTeacherDetails.presentDatesList?.length === 0 && 
                             selectedTeacherDetails.leaveDatesList?.length === 0 && 
                             selectedTeacherDetails.absentDatesList?.length === 0 && (
                                <p className="text-center text-slate-400 italic py-10">ไม่พบข้อมูลรายละเอียด</p>
                            )}
                        </div>
                    </div>
                    
                    <div className="p-6 bg-slate-50 border-t flex justify-end">
                        <button 
                            onClick={() => setSelectedTeacherDetails(null)}
                            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-black transition-all active:scale-95"
                        >
                            ปิดหน้าต่าง
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const LoadingOverlay = () => {
        if (!isFetchingSummary || viewMode === 'SUMMARY_REPORT') return null;
        return (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
                <div className="bg-white p-6 rounded-3xl shadow-2xl flex items-center gap-4 border border-slate-100">
                    <RefreshCw className="animate-spin text-blue-600" size={24}/>
                    <span className="font-black text-slate-700">กำลังดึงข้อมูลรายละเอียด...</span>
                </div>
            </div>
        );
    };

    const isAdminView = currentUser.roles.some(role => 
        ['SYSTEM_ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'DOCUMENT_OFFICER'].includes(role)
    ) || currentUser.isActingDirector;

    const isSummaryAuthorized = currentUser.roles.some(role => 
        ['DIRECTOR', 'DOCUMENT_OFFICER', 'SYSTEM_ADMIN'].includes(role)
    ) || currentUser.isActingDirector;

    const fetchSummaryData = async (customStart?: string, customEnd?: string) => {
        if (!supabase) return [];
        setIsFetchingSummary(true);
        const startToUse = customStart || startDate;
        const endToUse = customEnd || endDate;
        try {
            // Fetch all attendance records in range
            const { data: attendance, error: attError } = await supabase
                .from('attendance')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .gte('date', startToUse)
                .lte('date', endToUse);
            
            if (attError) throw attError;

            // Fetch all leave requests in range
            const { data: leaves, error: leaveError } = await supabase
                .from('leave_requests')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .eq('status', 'Approved')
                .lte('start_date', endToUse)
                .gte('end_date', startToUse);

            if (leaveError) throw leaveError;

            const teachers = allTeachers.filter(t => t.schoolId === currentUser.schoolId && !t.isSuspended && !t.roles.includes('DIRECTOR'));

            // Pre-calculate all workdays in range for absent calculation
            const allWorkDays: string[] = [];
            const startRange = new Date(startToUse);
            const endRange = new Date(endToUse);
            const curRange = new Date(startRange);
            while (curRange <= endRange) {
                const day = curRange.getDay();
                if (day !== 0 && day !== 6) {
                    allWorkDays.push(curRange.toISOString().split('T')[0]);
                }
                curRange.setDate(curRange.getDate() + 1);
            }

            const summary = teachers.map(teacher => {
                const teacherAtt = (attendance || []).filter((a: any) => a.teacher_id === teacher.id);
                const teacherLeaves = (leaves || []).filter((l: any) => l.teacher_id === teacher.id);

                // Count unique present days
                const presentDates = new Set(
                    teacherAtt
                        .filter((a: any) => a.status === 'OnTime' || a.status === 'Late')
                        .map((a: any) => a.date)
                );
                const presentDays = presentDates.size;
                const presentDatesList = Array.from(presentDates).sort();

                // Count unique late days
                const lateDates = new Set(
                    teacherAtt
                        .filter((a: any) => a.status === 'Late')
                        .map((a: any) => a.date)
                );
                const lateDays = lateDates.size;
                const lateDatesList = Array.from(lateDates).sort();
                
                // Count unique leave days in range
                const leaveDates = new Set<string>();
                teacherLeaves.forEach((leave: any) => {
                    const start = new Date(leave.start_date > startToUse ? leave.start_date : startToUse);
                    const end = new Date(leave.end_date < endToUse ? leave.end_date : endToUse);
                    const cur = new Date(start);
                    while (cur <= end) {
                        const day = cur.getDay();
                        if (day !== 0 && day !== 6) {
                            leaveDates.add(cur.toISOString().split('T')[0]);
                        }
                        cur.setDate(cur.getDate() + 1);
                    }
                });
                const leaveDaysCount = leaveDates.size;
                const leaveDatesList = Array.from(leaveDates).sort();

                // Calculate absent dates
                const absentDatesList = allWorkDays.filter(date => !presentDates.has(date) && !leaveDates.has(date));

                // Earliest check-in
                const checkInTimes = teacherAtt
                    .filter((a: any) => a.check_in_time && a.check_in_time !== 'Leave')
                    .map((a: any) => a.check_in_time);
                const earliestCheckIn = checkInTimes.length > 0 ? checkInTimes.sort()[0] : null;

                return {
                    id: teacher.id,
                    name: teacher.name,
                    position: teacher.position,
                    presentDays,
                    presentDatesList,
                    lateDays,
                    lateDatesList,
                    leaveDays: leaveDaysCount,
                    leaveDatesList,
                    absentDays: absentDatesList.length,
                    absentDatesList,
                    earliestCheckIn,
                };
            });

            setSummaryData(summary);
            return summary;
        } catch (err: any) {
            console.error("Summary Fetch Error:", err.message);
            alert("ไม่สามารถดึงข้อมูลสรุปได้");
            return [];
        } finally {
            setIsFetchingSummary(false);
        }
    };

    const handleTeacherClick = async (teacher: Teacher, existingData?: any) => {
        if (existingData) {
            setSelectedTeacherDetails(existingData);
            return;
        }

        // Fetch summary for current month by default when clicking from main view
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        
        const data = await fetchSummaryData(start, end);
        const teacherData = data.find(d => d.id === teacher.id);
        if (teacherData) {
            setSelectedTeacherDetails(teacherData);
        }
    };

    const sortedSummaryData = useMemo(() => {
        const data = [...summaryData];
        if (summarySortOrder === 'EARLIEST') {
            return data.sort((a, b) => {
                if (!a.earliestCheckIn) return 1;
                if (!b.earliestCheckIn) return -1;
                return a.earliestCheckIn.localeCompare(b.earliestCheckIn);
            });
        }
        return data.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    }, [summaryData, summarySortOrder]);

    const fetchData = async () => {
        if (!isConfigured || !supabase) return;
        setIsLoadingData(true);
        setErrorMsg(null);

        try {
            let query = supabase!.from('attendance').select('*').eq('school_id', currentUser.schoolId);
            if (isAdminView) {
                query = query.eq('date', selectedDate);
            } else {
                query = query.eq('teacher_id', currentUser.id).order('date', { ascending: false });
            }
            const { data, error } = await query;
            if (error) throw error;
            const mappedData: AttendanceRecord[] = (data || []).map((r: any) => ({
                id: r.id.toString(),
                schoolId: r.school_id,
                teacherId: r.teacher_id,
                teacherName: r.teacher_name,
                date: r.date,
                checkInTime: r.check_in_time,
                checkOutTime: r.check_out_time,
                status: r.status,
                leaveType: r.leave_type,
                isAutoCheckout: r.is_auto_checkout,
                coordinate: r.coordinate
            }));
            setHistory(mappedData);

            const { data: leaves } = await supabase!.from('leave_requests')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .eq('status', 'Approved')
                .lte('start_date', selectedDate)
                .gte('end_date', selectedDate);
            
            const mappedLeaves: LeaveRequest[] = (leaves || []).map((l: any) => ({
                id: l.id.toString(),
                teacherId: l.teacher_id,
                teacherName: l.teacher_name,
                type: l.type,
                startDate: l.start_date,
                endDate: l.end_date,
                status: l.status,
                reason: l.reason
            } as any));
            setApprovedLeaves(mappedLeaves);

            // Auto Process Attendance for past dates
            const today = getTodayDateStr();
            if (isAdminView && selectedDate < today && currentSchool.autoCheckOutEnabled) {
                let hasChanges = false;

                // 1. Auto Check-out
                const missedCheckOuts = mappedData.filter(r => r.checkInTime && !r.checkOutTime && r.status !== 'Leave');
                for (const record of missedCheckOuts) {
                    const { error } = await supabase!.from('attendance')
                        .update({ 
                            check_out_time: currentSchool.autoCheckOutTime || '16:30',
                            is_auto_checkout: true
                        })
                        .eq('id', record.id);
                    if (!error) hasChanges = true;
                }

                // 2. Auto Leave
                const { data: teachers } = await supabase!.from('profiles')
                    .select('id, name')
                    .eq('school_id', currentUser.schoolId)
                    .eq('is_approved', true);
                    
                if (teachers) {
                    for (const teacher of teachers) {
                        const hasRecord = mappedData.find(r => r.teacherId === teacher.id);
                        if (!hasRecord) {
                            const leave = mappedLeaves.find(l => l.teacherId === teacher.id && l.type !== 'OffCampus');
                            if (leave) {
                                const { error } = await supabase!.from('attendance').insert([{
                                    school_id: currentUser.schoolId,
                                    teacher_id: teacher.id,
                                    teacher_name: teacher.name,
                                    date: selectedDate,
                                    check_in_time: 'Leave',
                                    check_out_time: 'Leave',
                                    status: 'Leave',
                                    leave_type: leave.type
                                }]);
                                if (!error) hasChanges = true;
                            }
                        }
                    }
                }

                if (hasChanges) {
                    // Re-run fetch to show updated data
                    fetchData();
                    return;
                }
            }

            const { data: todayData } = await supabase!.from('attendance')
                .select('*')
                .eq('teacher_id', currentUser.id)
                .eq('date', today)
                .maybeSingle();

            if (todayData) setTodayRecord({
                id: todayData.id.toString(),
                teacherId: todayData.teacher_id,
                teacherName: todayData.teacher_name,
                date: todayData.date,
                checkInTime: todayData.check_in_time,
                checkOutTime: todayData.check_out_time,
                status: todayData.status
            } as any);
            else setTodayRecord(null);

            const { data: config } = await supabase!.from('school_configs').select('*').eq('school_id', currentUser.schoolId).maybeSingle();
            if (config) setSchoolConfig(config);
        } catch (e: any) {
            console.error("Fetch Error:", e.message);
            setErrorMsg("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentUser.id, currentUser.schoolId, selectedDate, isAdminView]);

    const handleAttendanceAction = async (type: 'IN' | 'OUT') => {
        if (!supabase) return;
        setIsProcessing(true);
        setErrorMsg(null);
        try {
            const pos: any = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, { 
                    enableHighAccuracy: true,
                    timeout: 10000 
                });
            });
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const schoolLat = currentSchool.lat || 13.7563;
            const schoolLng = currentSchool.lng || 100.5018;
            const radius = currentSchool.radius || 500;
            const buffer = 25; // เพิ่มระยะเผื่อ 25 เมตรสำหรับความคลาดเคลื่อนของ GPS
            const dist = calculateDistance(lat, lng, schoolLat, schoolLng);
            setGpsStatus({ lat, lng, dist });
            
            // Check if WFH mode is enabled. If so, bypass location check.
            const isWfh = currentSchool.wfhModeEnabled === true;
            
            if (!isWfh && dist > (radius + buffer)) {
                throw new Error(`ไม่อนุญาตให้ลงเวลา: ท่านอยู่นอกพื้นที่โรงเรียน (${Math.round(dist)} ม.)\nพิกัดโรงเรียน: ${schoolLat.toFixed(6)}, ${schoolLng.toFixed(6)}\nพิกัดของท่าน: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            }
            const now = new Date();
            const dateStr = getTodayDateStr();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
            if (type === 'IN') {
                const status = timeStr > (currentSchool.lateTimeThreshold || '08:30') ? 'Late' : 'OnTime';
                const { error } = await supabase!.from('attendance').insert([{
                    school_id: currentUser.schoolId,
                    teacher_id: currentUser.id,
                    teacher_name: currentUser.name,
                    date: dateStr,
                    check_in_time: timeStr,
                    status: status,
                    coordinate: { lat, lng }
                }]);
                if (error) throw error;
                alert(`ลงเวลาเข้างานสำเร็จ: ${timeStr} น.`);

                // ส่งการแจ้งเตือน Telegram ถึงผู้อำนวยการ
                if (schoolConfig?.telegram_bot_token) {
                    const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                    const message = `🔔 <b>แจ้งเตือนการลงเวลาเข้างาน</b>\n\n` +
                                    `👤 <b>ชื่อ:</b> ${currentUser.name}\n` +
                                    `⏰ <b>เวลา:</b> ${timeStr} น.\n` +
                                    `📍 <b>สถานะ:</b> ${status === 'OnTime' ? '✅ มาปกติ' : '⚠️ มาสาย'}\n` +
                                    `📅 <b>วันที่:</b> ${getThaiDate(dateStr)}\n` +
                                    `🗺️ <b>พิกัด:</b> <a href="${googleMapsLink}">ดูบน Google Maps</a>`;
                    
                    // แจ้งเตือนคุณครูที่ลงเวลา
                    if (currentUser.telegramChatId) {
                        sendTelegramMessage(schoolConfig.telegram_bot_token, currentUser.telegramChatId, message);
                    }

                    // แจ้งเตือนผู้อำนวยการและผู้ดูแล
                    const directors = allTeachers.filter(t => 
                        (t.roles || []).includes('DIRECTOR') || 
                        t.isActingDirector || 
                        (t.roles || []).includes('SYSTEM_ADMIN')
                    );
                    
                    for (const director of directors) {
                        if (director.telegramChatId) {
                            sendTelegramMessage(schoolConfig.telegram_bot_token, director.telegramChatId, message);
                        }
                    }
                }
            } else {
                const { error } = await supabase!.from('attendance')
                    .update({ check_out_time: timeStr })
                    .eq('teacher_id', currentUser.id)
                    .eq('date', dateStr);
                if (error) throw error;
                alert(`ลงเวลากลับสำเร็จ: ${timeStr} น.`);

                // ส่งการแจ้งเตือน Telegram ถึงผู้อำนวยการและคุณครู (ขาออก)
                if (schoolConfig?.telegram_bot_token) {
                    const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                    const message = `🚪 <b>แจ้งเตือนการลงเวลากลับ</b>\n\n` +
                                    `👤 <b>ชื่อ:</b> ${currentUser.name}\n` +
                                    `⏰ <b>เวลา:</b> ${timeStr} น.\n` +
                                    `📅 <b>วันที่:</b> ${getThaiDate(dateStr)}\n` +
                                    `🗺️ <b>พิกัด:</b> <a href="${googleMapsLink}">ดูบน Google Maps</a>`;
                    
                    // แจ้งเตือนคุณครูที่ลงเวลา
                    if (currentUser.telegramChatId) {
                        sendTelegramMessage(schoolConfig.telegram_bot_token, currentUser.telegramChatId, message);
                    }

                    // แจ้งเตือนผู้อำนวยการและผู้ดูแล
                    const directors = allTeachers.filter(t => 
                        (t.roles || []).includes('DIRECTOR') || 
                        t.isActingDirector || 
                        (t.roles || []).includes('SYSTEM_ADMIN')
                    );
                    
                    for (const director of directors) {
                        if (director.telegramChatId) {
                            sendTelegramMessage(schoolConfig.telegram_bot_token, director.telegramChatId, message);
                        }
                    }
                }
            }
            fetchData(); 
        } catch (e: any) {
            setErrorMsg(e.message || "การลงเวลาขัดข้อง");
            alert(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const getLeaveTypeName = (type: string) => {
        const map: any = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจ', 'OffCampus': 'ออกนอกฯ', 'Late': 'เข้าสาย', 'Maternity': 'ลาคลอด' };
        return map[type] || 'ลา';
    };

    const groupedHistory = useMemo(() => {
        if (isAdminView && viewMode === 'MAIN') return {};
        const groups: { [key: string]: AttendanceRecord[] } = {};
        history.forEach(rec => {
            const monthYear = getThaiMonthYear(rec.date);
            if (!groups[monthYear]) groups[monthYear] = [];
            groups[monthYear].push(rec);
        });
        return groups;
    }, [history, isAdminView, viewMode]);

    const sortedTeachersForReport = useMemo(() => {
        return allTeachers
            .filter(t => t.schoolId === currentUser.schoolId && !t.isSuspended)
            .filter(t => !t.roles.includes('DIRECTOR')) 
            .sort((a, b) => {
                const recA = history.find(h => h.teacherId === a.id);
                const recB = history.find(h => h.teacherId === b.id);
                if (recA?.checkInTime && recB?.checkInTime) return recA.checkInTime.localeCompare(recB.checkInTime);
                if (recA?.checkInTime) return -1;
                if (recB?.checkInTime) return 1;
                const leaveA = approvedLeaves.find(l => l.teacherId === a.id);
                const leaveB = approvedLeaves.find(l => l.teacherId === b.id);
                if (leaveA && !leaveB) return -1;
                if (!leaveA && leaveB) return 1;
                return a.name.localeCompare(b.name, 'th');
            });
    }, [allTeachers, history, approvedLeaves, currentUser.schoolId]);

    if (isLoadingData) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4 font-sarabun text-slate-400">
            <Loader className="animate-spin text-blue-600" size={48}/>
            <p className="font-black uppercase tracking-widest text-xs">Synchronizing Records...</p>
        </div>
    );

    if (viewMode === 'SUMMARY_REPORT') {
        const totalWorkDays = countWeekdays(startDate, endDate);

        return (
            <div className="absolute inset-0 z-50 bg-[#f8fafc] min-h-screen font-sarabun text-slate-900 print:bg-white overflow-y-auto">
                {/* Control Header */}
                <div className="bg-slate-900/95 backdrop-blur-md p-4 shadow-xl print:hidden sticky top-0 z-50 flex flex-col md:flex-row justify-between items-center gap-4 px-10 border-b border-white/10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('MAIN')} className="flex items-center gap-2 text-white font-bold bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition-all active:scale-95">
                            <ArrowLeft size={20}/> ย้อนกลับ
                        </button>
                        <h2 className="text-white font-black text-lg">สรุปรายงานการมาปฏิบัติราชการ</h2>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                            <span className="text-white/60 text-[10px] font-black uppercase">เริ่ม:</span>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer"/>
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                            <span className="text-white/60 text-[10px] font-black uppercase">สิ้นสุด:</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer"/>
                        </div>
                        <button onClick={() => fetchSummaryData()} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">
                            <RefreshCw size={20} className={isFetchingSummary ? 'animate-spin' : ''}/>
                        </button>
                        <div className="h-8 w-px bg-white/20 mx-2 hidden md:block"></div>
                        <select 
                            value={summarySortOrder} 
                            onChange={(e: any) => setSummarySortOrder(e.target.value)}
                            className="bg-white/10 text-white font-bold text-xs px-3 py-2 rounded-xl border border-white/10 outline-none cursor-pointer"
                        >
                            <option value="NAME" className="text-slate-900">เรียงตามชื่อ</option>
                        </select>
                        <button onClick={() => window.print()} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95">
                            <Printer size={18}/> พิมพ์รายงาน
                        </button>
                    </div>
                </div>

                {/* Report Content */}
                <div className="max-w-[210mm] mx-auto bg-white my-8 p-[2cm] shadow-2xl print:shadow-none print:my-0 print:p-0">
                    <div className="text-center mb-8">
                        {currentSchool.logoBase64 && <img src={currentSchool.logoBase64} className="h-20 mx-auto mb-4 object-contain"/>}
                        <h1 className="text-2xl font-black text-slate-900">สรุปรายงานการมาปฏิบัติราชการ</h1>
                        <h2 className="text-lg font-bold text-slate-700">{currentSchool.name}</h2>
                        <p className="text-sm font-bold text-blue-600 mt-2">
                            ช่วงวันที่ {getThaiDate(startDate)} ถึง {getThaiDate(endDate)}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            จำนวนวันทำการทั้งหมด: {totalWorkDays} วัน
                        </p>
                    </div>

                    <table className="w-full border-collapse border border-slate-900 text-sm">
                        <thead>
                            <tr className="bg-slate-50 font-black text-center">
                                <th className="border border-slate-900 p-3 w-10">ที่</th>
                                <th className="border border-slate-900 p-3 text-left">ชื่อ-นามสกุล</th>
                                <th className="border border-slate-900 p-3 w-14">มา</th>
                                <th className="border border-slate-900 p-3 w-14">สาย</th>
                                <th className="border border-slate-900 p-3 w-14">ลา</th>
                                <th className="border border-slate-900 p-3 w-14">ขาด</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedSummaryData.map((item, idx) => {
                                return (
                                    <tr 
                                        key={item.id} 
                                        className="hover:bg-blue-50 transition-colors cursor-pointer group"
                                        onClick={() => handleTeacherClick({ id: item.id, name: item.name, position: item.position } as Teacher, item)}
                                    >
                                        <td className="border border-slate-900 p-3 text-center font-mono">{idx + 1}</td>
                                        <td className="border border-slate-900 p-3">
                                            <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                                {item.name}
                                                <Search size={14} className="opacity-0 group-hover:opacity-100 text-blue-400"/>
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.position}</div>
                                        </td>
                                        <td className="border border-slate-900 p-3 text-center font-black text-green-700">{item.presentDays}</td>
                                        <td className="border border-slate-900 p-3 text-center font-black text-orange-600">{item.lateDays}</td>
                                        <td className="border border-slate-900 p-3 text-center font-black text-blue-600">{item.leaveDays}</td>
                                        <td className="border border-slate-900 p-3 text-center font-black text-red-600">{item.absentDays}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Footer / Signatures */}
                    <div className="mt-16 grid grid-cols-2 gap-10">
                        <div className="text-center space-y-16">
                            <div className="space-y-2">
                                <p className="text-sm">ลงชื่อ..........................................................ผู้จัดทำรายงาน</p>
                                <p className="font-bold text-sm">({currentUser.name})</p>
                                <p className="text-xs text-slate-500">ตำแหน่ง {currentUser.position}</p>
                            </div>
                        </div>
                        <div className="text-center space-y-16">
                            <div className="space-y-2">
                                {(() => {
                                    const director = allTeachers.find(t => t.roles.includes('DIRECTOR')) || allTeachers.find(t => t.isActingDirector);
                                    const directorPosition = director?.isActingDirector ? 'รักษาการในตำแหน่งผู้อำนวยการโรงเรียน' : 'ผู้อำนวยการโรงเรียน';
                                    return (
                                        <>
                                            <p className="text-sm">ลงชื่อ..........................................................ผู้อนุมัติ</p>
                                            <p className="font-bold text-sm">( {director?.name || '......................................................'} )</p>
                                            <p className="text-xs text-slate-500">{directorPosition}</p>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    <div className="mt-20 text-[10px] text-slate-400 text-center italic border-t border-slate-100 pt-4">
                        รายงานนี้สร้างขึ้นโดยระบบอัตโนมัติ เมื่อวันที่ {getThaiDate(getTodayDateStr())} เวลา {new Date().toLocaleTimeString('th-TH')} น.
                    </div>
                </div>

                <TeacherDetailsModal />

                <style>{`
                    @media print {
                        @page { size: A4 portrait; margin: 1.5cm; }
                        body { background: white !important; -webkit-print-color-adjust: exact; }
                        .print-hidden { display: none !important; }
                        div.absolute { position: static !important; background: white !important; }
                        div.max-w-\\[210mm\\] { width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                    }
                `}</style>
            </div>
        );
    }

    // --- FORMAL DAILY PRINT VIEW (A4 CLEAN LOOK) ---
    if (viewMode === 'PRINT_DAILY') {
        const teachersToDisplay = sortedTeachersForReport;
        const presentCount = history.filter(h => teachersToDisplay.some(t => t.id === h.teacherId)).length;
        const leaveCount = approvedLeaves.filter(l => teachersToDisplay.some(t => t.id === l.teacherId)).length;
        const absentCount = Math.max(0, teachersToDisplay.length - (presentCount + leaveCount));

        return (
            <div className="absolute inset-0 z-50 bg-[#f1f5f9] min-h-screen font-sarabun text-slate-900 print:bg-white overflow-y-auto no-scrollbar-container">
                {/* Control Header (Floating on top, hidden during print) */}
                <div className="bg-slate-900/95 backdrop-blur-md p-4 shadow-xl print:hidden sticky top-0 z-50 flex justify-between items-center px-10 border-b border-white/10">
                    <button onClick={() => setViewMode('MAIN')} className="flex items-center gap-2 text-white font-bold bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition-all active:scale-95">
                        <ArrowLeft size={20}/> ย้อนกลับ
                    </button>
                    <div className="flex items-center gap-4">
                        <span className="text-white font-bold text-sm hidden md:block">รายงานประจำวันที่: {getThaiDate(selectedDate)}</span>
                        <button onClick={() => window.print()} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95">
                            <Printer size={20}/> พิมพ์สรุปผล (A4)
                        </button>
                    </div>
                </div>

                {/* A4 Sheet Container: Absolutely NO shadows or borders on web preview as requested */}
                <div className="mx-auto bg-white my-0 print:my-0 min-h-[297mm] w-[210mm] print:w-full box-border p-[2.5cm_2cm_2cm_2.5cm] print:p-0 no-scrollbar overflow-visible print:overflow-visible">
                    <div className="flex flex-col h-full bg-white print:p-0 border-none outline-none">
                        {/* Header Section */}
                        <div className="text-center mb-8 border-b-2 border-slate-900 pb-4">
                            {currentSchool.logoBase64 && <img src={currentSchool.logoBase64} className="h-16 mx-auto mb-3 object-contain"/>}
                            <h2 className="text-xl font-black uppercase tracking-tight">สรุปการลงเวลาปฏิบัติราชการรายวัน</h2>
                            <h3 className="text-md font-bold">{currentSchool.name}</h3>
                            <p className="text-sm font-bold text-blue-800 underline underline-offset-4">ประจำวันที่ {getThaiDate(selectedDate)}</p>
                        </div>

                        {/* Attendance Table */}
                        <table className="w-full border-collapse border border-black mb-8 text-[11px]">
                            <thead className="bg-slate-50/50">
                                <tr className="font-bold text-center">
                                    <th className="border border-black p-2 w-10">ที่</th>
                                    <th className="border border-black p-2 text-left">ชื่อ-นามสกุล</th>
                                    <th className="border border-black p-2 text-left w-40">ตำแหน่ง</th>
                                    <th className="border border-black p-2 w-20">เวลามา</th>
                                    <th className="border border-black p-2 w-20">เวลากลับ</th>
                                    <th className="border border-black p-2 w-32">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teachersToDisplay.map((t, i) => {
                                    const record = history.find(h => h.teacherId === t.id);
                                    const leave = approvedLeaves.find(l => l.teacherId === t.id);
                                    let statusText = 'ขาด / ยังไม่ลงชื่อ';
                                    let statusClass = 'text-red-600 font-bold';
                                    if (record) {
                                        statusText = record.status === 'OnTime' ? 'มาปกติ' : 'มาสาย';
                                        statusClass = record.status === 'OnTime' ? 'text-green-700' : 'text-orange-600';
                                    } else if (leave) {
                                        statusText = `ลา (${getLeaveTypeName(leave.type)})`;
                                        statusClass = 'text-blue-700';
                                    }

                                    return (
                                        <tr key={t.id} className="break-inside-avoid">
                                            <td className="border border-black p-2 text-center font-mono">{i + 1}</td>
                                            <td className="border border-black p-2 font-bold">{t.name}</td>
                                            <td className="border border-black p-2 text-slate-600">{t.position}</td>
                                            <td className="border border-black p-2 text-center font-bold">{record?.checkInTime || '-'}</td>
                                            <td className="border border-black p-2 text-center font-bold">{record?.checkOutTime || '-'}</td>
                                            <td className={`border border-black p-2 text-center ${statusClass}`}>{statusText}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>

                        {/* Signature Grid */}
                        <div className="grid grid-cols-2 gap-4 mt-4 print:break-inside-avoid">
                            {/* Left Side Summary */}
                            <div className="border border-slate-300 bg-slate-50/20 p-4 rounded-xl">
                                <h4 className="font-black text-slate-800 mb-2 border-b border-slate-300 pb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider">
                                    <Users size={14}/> สรุปยอด (ไม่รวม ผอ.)
                                </h4>
                                <div className="space-y-1 text-xs font-bold">
                                    <div className="flex justify-between"><span>มาปฏิบัติราชการ:</span><span className="text-green-700">{presentCount} ท่าน</span></div>
                                    <div className="flex justify-between"><span>ลาป่วย / กิจ / อื่นๆ:</span><span className="text-blue-600">{leaveCount} ท่าน</span></div>
                                    <div className="flex justify-between text-red-600"><span>ขาด / ยังไม่ลงเวลา:</span><span>{absentCount} ท่าน</span></div>
                                    <div className="flex justify-between border-t border-slate-300 pt-1 font-black text-sm"><span>รวมบุคลากร:</span><span>{teachersToDisplay.length} ท่าน</span></div>
                                </div>
                            </div>

                            {/* Right Side Signature */}
                            <div className="flex flex-col justify-end items-center text-center space-y-4">
                                <div className="w-full">
                                    <p className="mb-2 text-xs">ลงชื่อ..........................................................ผู้ตรวจสอบ</p>
                                    <p className="font-black text-sm">({currentUser.name})</p>
                                    <p className="text-[10px] text-slate-500 font-bold">ตำแหน่ง {currentUser.position}</p>
                                </div>
                            </div>
                        </div>

                        {/* Director Signature */}
                        <div className="text-center mt-12 pb-10 print:break-inside-avoid">
                            {(() => {
                                const director = allTeachers.find(t => t.roles.includes('DIRECTOR')) || allTeachers.find(t => t.isActingDirector);
                                const directorPosition = director?.isActingDirector ? 'รักษาการในตำแหน่งผู้อำนวยการโรงเรียน' : 'ผู้อำนวยการโรงเรียน';
                                return (
                                    <>
                                        <p className="mb-4 text-xs">ลงชื่อ......................................................{directorPosition}</p>
                                        <p className="font-black text-md">
                                            ( {director?.name || '......................................................'} )
                                        </p>
                                    </>
                                );
                            })()}
                            <p className="text-[9px] mt-2 text-slate-400 font-black uppercase tracking-widest italic">ผู้อนุมัติและรับรองเวลาปฏิบัติราชการ</p>
                        </div>
                    </div>
                </div>

                <style>{`
                    /* บังคับลบ Scrollbar ทั้งหมดเพื่อป้องกันเส้นตรงเหมือนเคอร์เซอร์ */
                    .no-scrollbar-container::-webkit-scrollbar { display: none !important; width: 0 !important; }
                    .no-scrollbar-container { -ms-overflow-style: none !important; scrollbar-width: none !important; }
                    
                    /* ลบ Scrollbar สำหรับตัวกระดาษ A4 */
                    .no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; }
                    .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }

                    @media print {
                        @page { 
                            size: A4 portrait; 
                            margin: 0; 
                        }
                        body { 
                            background: white !important; 
                            -webkit-print-color-adjust: exact; 
                            margin: 0 !important; 
                            padding: 0 !important;
                            overflow: visible !important;
                        }
                        /* บังคับระยะขอบกระดาษจริงและลบทุกอย่างที่เป็น UI */
                        div.mx-auto { 
                            width: 100% !important; 
                            height: 100% !important;
                            margin: 0 !important; 
                            padding: 2.5cm 2cm 2cm 2.5cm !important; /* บน ซ้าย ล่าง ขวา */
                            box-shadow: none !important;
                            border: none !important;
                            outline: none !important;
                            page-break-after: always;
                            overflow: visible !important;
                        }
                        div.no-scrollbar-container { overflow: visible !important; }
                        thead { display: table-header-group !important; }
                        tr { page-break-inside: avoid !important; }
                        .no-print { display: none !important; }
                    }
                `}</style>
            </div>
        );
    }

    // --- MAIN DASHBOARD UI ---
    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 font-sarabun">
            <div className="bg-slate-800 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border-b-4 border-slate-900">
                <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-blue-600 rounded-3xl shadow-xl shadow-blue-500/20"><MapPinned size={32}/></div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">ลงเวลาปฏิบัติราชการ</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <p className="text-blue-400 font-bold flex items-center gap-2 uppercase tracking-widest text-xs"><ShieldCheck size={14}/> {currentSchool.name}</p>
                                {currentSchool.wfhModeEnabled && (
                                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 font-black uppercase tracking-tighter animate-pulse">WFH MODE ACTIVE</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-center md:text-right bg-white/5 p-4 px-8 rounded-3xl border border-white/10 backdrop-blur-md">
                        <p className="text-blue-200 font-black text-2xl">{new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})} น.</p>
                        <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-tighter">{getThaiDate(getTodayDateStr())}</p>
                    </div>
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-50 border-2 border-red-100 p-5 rounded-3xl flex items-start gap-4 animate-shake">
                    <div className="p-2 bg-red-600 text-white rounded-xl"><AlertTriangle size={20}/></div>
                    <div><h4 className="font-black text-red-600 uppercase text-xs tracking-widest mb-1">การลงเวลาผิดพลาด</h4><p className="text-red-700 font-bold text-sm leading-relaxed">{errorMsg}</p></div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all group ${todayRecord ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-gradient-to-br from-emerald-50 to-green-100 border-green-200 hover:shadow-2xl hover:shadow-green-200/50 hover:-translate-y-1'}`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-green-600 text-white shadow-lg'}`}><CheckCircle size={32}/></div>
                        <div><h3 className={`text-2xl font-black ${todayRecord ? 'text-slate-400' : 'text-green-800'}`}>ลงเวลามาปฏิบัติงาน</h3><p className="text-green-700/60 text-xs font-bold uppercase tracking-widest">School Entry Check-In</p></div>
                        {todayRecord ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลามาแล้ว</p><p className="text-2xl font-black text-green-600">{todayRecord.checkInTime} น.</p><p className="text-[10px] font-bold text-slate-400 mt-1">สถานะ: {todayRecord.status === 'OnTime' ? 'ปกติ' : 'มาสาย'}</p></div>
                        ) : (
                            <button onClick={() => handleAttendanceAction('IN')} disabled={isProcessing} className="w-full py-5 bg-green-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-green-200 hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-3">{isProcessing ? <RefreshCw className="animate-spin" size={24}/> : <Navigation size={24}/>} ยืนยันพิกัดลงเวลาเข้า</button>
                        )}
                    </div>
                </div>

                <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all group ${todayRecord?.checkOutTime || !todayRecord ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200 hover:shadow-2xl hover:shadow-orange-200/50 hover:-translate-y-1'}`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${todayRecord?.checkOutTime || !todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-orange-600 text-white shadow-lg'}`}><LogOut size={32}/></div>
                        <div><h3 className={`text-2xl font-black ${todayRecord?.checkOutTime || !todayRecord ? 'text-slate-400' : 'text-orange-800'}`}>ลงเวลากลับบ้าน</h3><p className="text-orange-700/60 text-xs font-bold uppercase tracking-widest">Work Departure Check-Out</p></div>
                        {todayRecord?.checkOutTime ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลากลับแล้ว</p><p className="text-2xl font-black text-orange-600">{todayRecord.checkOutTime} น.</p><p className="text-[10px] font-bold text-slate-400 mt-1">ขอบคุณที่ปฏิบัติหน้าที่ในวันนี้</p></div>
                        ) : !todayRecord ? (
                             <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 border-dashed text-center"><p className="text-xs font-bold text-slate-400 italic">กรุณาลงเวลามาปฏิบัติงานก่อน</p></div>
                        ) : (
                            <button onClick={() => handleAttendanceAction('OUT')} disabled={isProcessing} className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-orange-200 hover:bg-orange-700 active:scale-95 transition-all flex items-center justify-center gap-3">{isProcessing ? <RefreshCw className="animate-spin" size={24}/> : <Navigation size={24}/>} ยืนยันพิกัดลงเวลากลับ</button>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-8 bg-slate-50 border-b flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
                        <h3 className="font-black text-xl text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                            <History className="text-blue-600" size={24}/>
                            {isAdminView ? 'ข้อมูลการปฏิบัติราชการ' : 'ประวัติการลงเวลา'}
                        </h3>
                        {isAdminView && (
                            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border-2 border-slate-100 shadow-inner">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เลือกวันที่:</span>
                                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-bold text-slate-700 outline-none cursor-pointer bg-transparent"/>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        {isSummaryAuthorized && (
                            <button 
                                onClick={() => {
                                    setViewMode('SUMMARY_REPORT');
                                    fetchSummaryData();
                                }} 
                                className="flex-1 sm:flex-none p-3 px-6 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-black text-xs shadow-lg active:scale-95"
                            >
                                <FileSpreadsheet size={16}/> สรุปการมาทำงาน
                            </button>
                        )}
                        {isAdminView && (
                            <button onClick={() => setViewMode('PRINT_DAILY')} className="flex-1 sm:flex-none p-3 px-6 bg-slate-800 text-white rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 font-black text-xs shadow-lg active:scale-95">
                                <Printer size={16}/> พิมพ์ใบสรุปประจำวัน
                            </button>
                        )}
                        <button onClick={fetchData} className="p-3 bg-white border-2 border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm">
                            <RefreshCw size={20}/>
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {!isAdminView ? (
                        <div className="p-8 space-y-10">
                            {Object.keys(groupedHistory).length === 0 ? (
                                <div className="text-center py-20 text-slate-300 italic font-bold">ไม่พบประวัติในระบบ</div>
                            ) : Object.keys(groupedHistory).map(monthYear => (
                                <div key={monthYear} className="space-y-4 animate-fade-in">
                                    <h4 className="font-black text-lg text-blue-600 flex items-center gap-2 border-b-2 border-blue-50 pb-2">
                                        <CalendarDays size={20}/> ประจำเดือน {monthYear}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {groupedHistory[monthYear].map(rec => (
                                            <div key={rec.id} className="bg-white border-2 border-slate-100 p-5 rounded-[2rem] hover:shadow-lg transition-all group">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getThaiDate(rec.date)}</p>
                                                        <p className={`text-xs font-black uppercase mt-1 ${rec.status === 'OnTime' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {rec.status === 'OnTime' ? 'มาปกติ' : 'มาสาย'}
                                                        </p>
                                                    </div>
                                                    <div className="p-2 bg-slate-50 rounded-xl text-slate-300 group-hover:text-blue-600 transition-colors"><Clock size={16}/></div>
                                                </div>
                                                <div className="flex justify-between items-end border-t pt-3 mt-3 border-slate-50">
                                                    <div><p className="text-[9px] font-bold text-slate-400 uppercase">มา / กลับ</p><p className="font-black text-slate-700">{rec.checkInTime} / {rec.checkOutTime || '--:--'}</p></div>
                                                    {rec.coordinate && (
                                                        <a href={`https://www.google.com/maps?q=${rec.coordinate.lat},${rec.coordinate.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[10px] font-bold flex items-center gap-1">พิกัด <Navigation size={10}/></a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                <tr>
                                    <th className="p-6">รายชื่อบุคลากร (เรียงตามเวลาที่มา)</th>
                                    <th className="p-6 text-center">เวลามา</th>
                                    <th className="p-6 text-center">เวลากลับ</th>
                                    <th className="p-6 text-center">สถานะ</th>
                                    <th className="p-6 text-center">GPS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {sortedTeachersForReport.map((t, idx) => {
                                    const record = history.find(h => h.teacherId === t.id);
                                    const leave = approvedLeaves.find(l => l.teacherId === t.id);
                                    let statusText = 'ยังไม่ลงชื่อ / ขาด';
                                    let statusClass = 'bg-slate-100 text-slate-400';
                                    if (record) {
                                        statusText = record.status === 'OnTime' ? 'มาปกติ' : 'มาสาย';
                                        statusClass = record.status === 'OnTime' ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-rose-600 text-white shadow-rose-100';
                                    } else if (leave) {
                                        statusText = `ลา (${getLeaveTypeName(leave.type)})`;
                                        statusClass = 'bg-blue-600 text-white shadow-blue-100';
                                    }
                                    return (
                                        <tr 
                                            key={t.id} 
                                            className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                            onClick={() => handleTeacherClick(t)}
                                        >
                                            <td className="p-6">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl bg-white border-2 border-slate-100 flex items-center justify-center font-black text-slate-400 shadow-sm transition-all group-hover:border-blue-200`}>{idx + 1}</div>
                                                    <div>
                                                        <div className="font-black text-slate-700 group-hover:text-blue-600 transition-colors">{t.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.position}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6 text-center font-black text-slate-600">{record?.checkInTime || '-'}</td>
                                            <td className="p-6 text-center font-black text-slate-600">{record?.checkOutTime || '-'}</td>
                                            <td className="p-6 text-center"><span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg border-2 border-white ${statusClass}`}>{statusText}</span></td>
                                            <td className="p-6 text-center">{record?.coordinate && (<a href={`https://www.google.com/maps?q=${record.coordinate.lat},${record.coordinate.lng}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-300 hover:text-blue-600 inline-block transition-colors"><Navigation size={18}/></a>)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <TeacherDetailsModal />
            <LoadingOverlay />

            <style>{`
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } } .animate-shake { animation: shake 0.3s ease-in-out; }
            `}</style>
        </div>
    );
};

export default AttendanceSystem;