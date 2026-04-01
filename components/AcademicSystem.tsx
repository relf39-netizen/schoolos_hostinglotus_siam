import React, { useState, useEffect, useMemo } from 'react';
import { Teacher, EnrollmentData, TestScoreData, TestType, AcademicCalendarEvent, AcademicSAR, SARType, SystemConfig } from '@/types';
import { CURRENT_SCHOOL_YEAR } from '@/constants';
import { 
    GraduationCap, Users, LineChart as LineChartIcon, BarChart as BarChartIcon, 
    Save, ChevronLeft, Award, Database, Loader, Cloud, RefreshCw,
    Calendar, FileText, Plus, Trash2, ExternalLink, FileUp, Info,
    LayoutDashboard, CheckCircle, Clock, BookOpen, Target, ArrowRight,
    CalendarPlus, AlertCircle, X, UserCheck, UsersRound
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart as RechartsLineChart, Line, Cell
} from 'recharts';
import { supabase, isConfigured } from '@/supabaseClient';

interface AcademicSystemProps {
    currentUser: Teacher;
}

const BAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];

const AcademicSystem: React.FC<AcademicSystemProps> = ({ currentUser }) => {
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'ENROLLMENT' | 'TEST_SCORES' | 'CALENDAR' | 'SAR'>('DASHBOARD');
    const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
    const [testScores, setTestScores] = useState<TestScoreData[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<AcademicCalendarEvent[]>([]);
    const [sars, setSars] = useState<AcademicSAR[]>([]);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const [selectedYear, setSelectedYear] = useState<string>(CURRENT_SCHOOL_YEAR);
    const [availableYears, setAvailableYears] = useState<string[]>(['2565', '2566', '2567', '2568']);
    const [showAddYearModal, setShowAddYearModal] = useState(false);
    const [newYearInput, setNewYearInput] = useState('');

    const [tempEnrollment, setTempEnrollment] = useState<EnrollmentData | null>(null);
    const [selectedTestType, setSelectedTestType] = useState<TestType>('ONET_P6');
    const [tempScore, setTempScore] = useState<TestScoreData | null>(null);

    // State for enrollment breakdown
    const [selectedEnrollDetail, setSelectedEnrollDetail] = useState<EnrollmentData | null>(null);

    // Forms for new features
    const [showCalendarForm, setShowCalendarForm] = useState(false);
    const [newCalEvent, setNewCalEvent] = useState({ title: '', startDate: '', endDate: '', year: CURRENT_SCHOOL_YEAR, description: '' });
    const [showSarForm, setShowSarForm] = useState(false);
    const [newSar, setNewSar] = useState({ year: CURRENT_SCHOOL_YEAR, type: 'BASIC' as SARType });

    const isAcademicAdmin = (currentUser.roles || []).includes('ACADEMIC_OFFICER') || 
                           (currentUser.roles || []).includes('DOCUMENT_OFFICER') || 
                           (currentUser.roles || []).includes('DIRECTOR') || 
                           (currentUser.roles || []).includes('SYSTEM_ADMIN');

    const loadData = async () => {
        setIsLoading(true);
        if (isConfigured && supabase) {
            try {
                const { data: configData } = await supabase.from('school_configs').select('*').eq('school_id', currentUser.schoolId).maybeSingle();
                if (configData) {
                    setSysConfig({
                        driveFolderId: configData.drive_folder_id || '',
                        scriptUrl: configData.script_url || '',
                        schoolName: configData.school_name || '',
                        officerDepartment: configData.officer_department || '',
                        internalDepartments: configData.internal_departments || [],
                        externalAgencies: configData.external_agencies || [],
                        directorSignatureBase64: configData.director_signature_base_64 || '',
                        schoolLogoBase64: configData.school_logo_base_64 || '',
                        officialGarudaBase64: configData.official_garuda_base_64 || '',
                        directorSignatureScale: configData.director_signature_scale || 1.0,
                        directorSignatureYOffset: configData.director_signature_y_offset || 0,
                        telegramBotToken: configData.telegram_bot_token || '',
                        telegramBotUsername: configData.telegram_bot_username || '',
                        appBaseUrl: configData.app_base_url || ''
                    });
                }

                const { data: enrollData } = await supabase.from('academic_enrollments').select('*').eq('school_id', currentUser.schoolId);
                const mappedEnroll: EnrollmentData[] = enrollData ? enrollData.map((d: any) => ({ id: d.id, schoolId: d.school_id, year: d.year, levels: d.levels })) : [];
                setEnrollments(mappedEnroll);

                const { data: scoreData } = await supabase.from('academic_test_scores').select('*').eq('school_id', currentUser.schoolId);
                const mappedScores: TestScoreData[] = scoreData ? scoreData.map((d: any) => ({ id: d.id, schoolId: d.school_id, year: d.year, testType: d.test_type as TestType, results: d.results })) : [];
                setTestScores(mappedScores);

                const { data: calData } = await supabase.from('academic_calendar').select('*').eq('school_id', currentUser.schoolId).order('start_date', { ascending: true });
                const mappedCal: AcademicCalendarEvent[] = calData ? calData.map((d: any) => ({ 
                    id: d.id.toString(), 
                    schoolId: d.school_id, 
                    year: d.year, 
                    title: d.title, 
                    startDate: d.start_date, 
                    endDate: d.end_date || d.start_date, 
                    description: d.description 
                })) : [];
                setCalendarEvents(mappedCal);

                const { data: sarData } = await supabase.from('academic_sar').select('*').eq('school_id', currentUser.schoolId).order('year', { ascending: false });
                const mappedSar: AcademicSAR[] = sarData ? sarData.map((d: any) => ({ 
                    id: d.id.toString(), 
                    schoolId: d.school_id, 
                    year: d.year, 
                    type: d.type as SARType, 
                    fileUrl: d.file_url, 
                    fileName: d.file_name 
                })) : [];
                setSars(mappedSar);

                const years = new Set<string>(['2565', '2566', '2567', '2568', '2569']);
                mappedEnroll.forEach((e: EnrollmentData) => years.add(e.year));
                mappedScores.forEach((s: TestScoreData) => years.add(s.year));
                mappedCal.forEach((c: AcademicCalendarEvent) => years.add(c.year));
                mappedSar.forEach((s: AcademicSAR) => years.add(s.year));
                setAvailableYears(Array.from(years).sort((a: string, b: string) => parseInt(b) - parseInt(a)));

            } catch (err) {
                console.error("Database Fetch Error:", err);
            }
        }
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, [currentUser.schoolId]);

    const LEVELS = [
        { id: 'Anuban1', label: 'อนุบาล 1' }, { id: 'Anuban2', label: 'อนุบาล 2' }, { id: 'Anuban3', label: 'อนุบาล 3' },
        { id: 'Prathom1', label: 'ป.1' }, { id: 'Prathom2', label: 'ป.2' }, { id: 'Prathom3', label: 'ป.3' },
        { id: 'Prathom4', label: 'ป.4' }, { id: 'Prathom5', label: 'ป.5' }, { id: 'Prathom6', label: 'ป.6' },
        { id: 'Matthayom1', label: 'ม.1' }, { id: 'Matthayom2', label: 'ม.2' }, { id: 'Matthayom3', label: 'ม.3' },
    ];

    const getTestSubjectLabel = (key: string) => {
        const map: any = { 'Reading': 'การอ่านออกเสียง', 'Understanding': 'การอ่านรู้เรื่อง', 'Math': 'คณิตศาสตร์', 'Thai': 'ภาษาไทย', 'Science': 'วิทยาศาสตร์', 'English': 'ภาษาอังกฤษ' };
        return map[key] || key;
    };

    const getTestSubjects = (type: TestType) => {
        switch(type) {
            case 'RT': return ['Reading', 'Understanding'];
            case 'NT': return ['Math', 'Thai'];
            case 'ONET_P6': 
            case 'ONET_M3':
            case 'ONET': return ['Thai', 'Math', 'Science', 'English'];
            default: return [];
        }
    };

    const handleAddYear = () => {
        if (!newYearInput || newYearInput.length !== 4) {
            alert("กรุณาระบุปีการศึกษา 4 หลัก (พ.ศ.)");
            return;
        }
        if (availableYears.includes(newYearInput)) {
            alert("มีปีการศึกษานี้ในระบบอยู่แล้ว");
            return;
        }
        setAvailableYears(prev => [...prev, newYearInput].sort((a,b) => parseInt(b) - parseInt(a)));
        setSelectedYear(newYearInput);
        setShowAddYearModal(false);
        setNewYearInput('');
    };

    const handleSaveEnrollment = async () => {
        if (!tempEnrollment || !supabase) return;
        setIsSaving(true);
        const payload = { id: `enroll_${currentUser.schoolId}_${tempEnrollment.year}`, school_id: currentUser.schoolId, year: tempEnrollment.year, levels: tempEnrollment.levels };
        const { error } = await supabase.from('academic_enrollments').upsert([payload]);
        if (!error) { 
            alert("บันทึกข้อมูลจำนวนนักเรียนเรียบร้อยแล้ว"); 
            await loadData(); 
            setViewMode('DASHBOARD'); 
        } else {
            alert("เกิดข้อผิดพลาด: " + error.message);
        }
        setIsSaving(false);
    };

    const handleSaveScore = async () => {
        if (!tempScore || !supabase) return;
        setIsSaving(true);
        const payload = { id: `score_${currentUser.schoolId}_${tempScore.testType.toLowerCase()}_${tempScore.year}`, school_id: currentUser.schoolId, year: tempScore.year, test_type: tempScore.testType, results: tempScore.results };
        const { error } = await supabase.from('academic_test_scores').upsert([payload]);
        if (!error) { 
            alert("บันทึกคะแนนสอบเรียบร้อยแล้ว"); 
            await loadData(); 
            setViewMode('DASHBOARD'); 
        } else {
            alert("เกิดข้อผิดพลาด: " + error.message);
        }
        setIsSaving(false);
    };

    const handleAddCalendarEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase || !newCalEvent.title || !newCalEvent.startDate) {
            alert("กรุณากรอกข้อมูลให้ครบถ้วน");
            return;
        }
        setIsSaving(true);
        try {
            const { error } = await supabase.from('academic_calendar').insert([{
                school_id: currentUser.schoolId, 
                year: newCalEvent.year, 
                title: newCalEvent.title, 
                start_date: newCalEvent.startDate,
                end_date: newCalEvent.endDate || newCalEvent.startDate,
                description: newCalEvent.description
            }]);
            
            if (!error) { 
                alert("บันทึกกิจกรรมเรียบร้อยแล้ว");
                setNewCalEvent({ title: '', startDate: '', endDate: '', year: selectedYear, description: '' }); 
                setShowCalendarForm(false); 
                await loadData(); 
            } else {
                throw error;
            }
        } catch (err: any) {
            console.error("Insert error:", err);
            alert("ล้มเหลว: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCalendarEvent = async (id: string) => {
        if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบกิจกรรมปฏิบัติงานวิชาการนี้?")) return;
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('academic_calendar').delete().eq('id', id);
        if (!error) {
            alert("ลบข้อมูลสำเร็จ");
            loadData();
        } else {
            alert("ลบไม่สำเร็จ: " + error.message);
        }
    };

    const handleUploadSar = async (file: File) => {
        if (!sysConfig?.scriptUrl || !sysConfig?.driveFolderId) {
            alert("ผู้ดูแลระบบยังไม่ได้ตั้งค่า Google Drive Bridge");
            return;
        }
        setIsUploading(true);
        try {
            const reader = new FileReader();
            const base64DataPromise = new Promise<string>((resolve) => {
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
            });
            reader.readAsDataURL(file);
            const base64Data = await base64DataPromise;

            const fileName = `SAR_${newSar.type}_${newSar.year}_${Date.now()}.pdf`;
            const response = await fetch(sysConfig.scriptUrl.trim(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ folderId: sysConfig.driveFolderId, fileName, mimeType: file.type, fileData: base64Data }),
                redirect: 'follow'
            });
            const responseText = await response.text();
            if (responseText.trim().startsWith('error:')) {
                throw new Error(responseText.trim().replace('error:', '').trim());
            }

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                throw new Error("เซิร์ฟเวอร์ตอบกลับด้วยรูปแบบที่ไม่ถูกต้อง: " + responseText.substring(0, 100));
            }
            if (result.status === 'success') {
                const { error } = await supabase!.from('academic_sar').insert([{
                    school_id: currentUser.schoolId, year: newSar.year, type: newSar.type, file_url: result.viewUrl || result.url, file_name: fileName
                }]);
                if (!error) { 
                    alert("อัปโหลดรายงาน SAR สำเร็จ");
                    setShowSarForm(false); 
                    loadData(); 
                }
            } else throw new Error(result.message);
        } catch (e: any) {
            alert("อัปโหลดล้มเหลว: " + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    const initEnrollmentForm = (year: string) => {
        const existing = enrollments.find(e => e.year === year);
        if (existing) setTempEnrollment({ ...existing });
        else {
            const empty: any = {}; LEVELS.forEach(l => empty[l.id] = { m: 0, f: 0 });
            setTempEnrollment({ id: '', schoolId: currentUser.schoolId, year, levels: empty });
        }
    };

    const initScoreForm = (year: string, type: TestType) => {
        const existing = testScores.find(s => s.year === year && s.testType === type);
        if (existing) setTempScore({ ...existing });
        else {
            const res: any = {}; getTestSubjects(type).forEach(s => res[s] = 0);
            setTempScore({ id: '', schoolId: currentUser.schoolId, year, testType: type, results: res });
        }
    };

    const getThaiShortDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    };

    const renderDashboard = () => {
        const enrollmentChartData = enrollments
            .sort((a, b) => parseInt(a.year) - parseInt(b.year))
            .map(e => {
                let total = 0;
                Object.values(e.levels).forEach((val: any) => { 
                    total += (val.m || 0) + (val.f || 0); 
                });
                return { year: `ปี ${e.year}`, Total: total, raw: e };
            });

        const prepareScoreData = (type: TestType) => {
            return testScores.filter(s => s.testType === type)
                .sort((a,b) => parseInt(a.year) - parseInt(b.year))
                .map(s => {
                    const item: any = { year: `ปี ${s.year}` };
                    Object.keys(s.results).forEach(subj => { item[getTestSubjectLabel(subj)] = s.results[subj]; });
                    return item;
                });
        };

        const rtData = prepareScoreData('RT');
        const ntData = prepareScoreData('NT');
        const onetP6Data = prepareScoreData('ONET_P6');
        const onetM3Data = prepareScoreData('ONET_M3');
        const oldOnetData = prepareScoreData('ONET');

        const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

        const hasM3Students = enrollments.some(e => {
            const m1 = e.levels['Matthayom1'];
            const m2 = e.levels['Matthayom2'];
            const m3 = e.levels['Matthayom3'];
            return (m1?.m || 0) + (m1?.f || 0) + (m2?.m || 0) + (m2?.f || 0) + (m3?.m || 0) + (m3?.f || 0) > 0;
        });
        const hasM3OnetData = onetM3Data.length > 0;

        return (
            <div className="space-y-8 pb-20 animate-fade-in">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button onClick={() => setViewMode('DASHBOARD')} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${viewMode === 'DASHBOARD' ? 'bg-gradient-to-br from-indigo-500 to-blue-700 text-white border-transparent shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200'}`}>
                        <LayoutDashboard size={24}/><span className="text-xs font-black uppercase tracking-widest">สรุปภาพรวม</span>
                    </button>
                    <button onClick={() => setViewMode('CALENDAR')} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${viewMode === 'CALENDAR' ? 'bg-gradient-to-br from-purple-500 to-indigo-700 text-white border-transparent shadow-lg shadow-purple-200' : 'bg-white text-slate-500 border-slate-100 hover:border-purple-200'}`}>
                        <Calendar size={24}/><span className="text-xs font-black uppercase tracking-widest">ปฏิทินปฏิบัติงาน</span>
                    </button>
                    <button onClick={() => setViewMode('SAR')} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${viewMode === 'SAR' ? 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white border-transparent shadow-lg shadow-emerald-200' : 'bg-white text-slate-500 border-slate-100 hover:border-emerald-200'}`}>
                        <FileText size={24}/><span className="text-xs font-black uppercase tracking-widest">รายงาน SAR</span>
                    </button>
                    <div className="bg-gradient-to-br from-slate-100 to-slate-200 p-4 rounded-2xl border-2 border-slate-200 flex flex-col items-center justify-center text-slate-600 shadow-inner">
                        <Database size={20}/><span className="text-[10px] font-black uppercase mt-1 tracking-widest">SQL Cloud Link</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                        <h3 className="font-black text-slate-800 mb-2 flex items-center gap-2 underline underline-offset-8 decoration-indigo-500 decoration-4"><Users size={20} className="text-indigo-500"/> สถิตินักเรียนรายปี</h3>
                        <p className="text-[10px] text-slate-400 font-bold mb-4 uppercase tracking-widest">* คลิกที่แท่งกราฟเพื่อดูรายละเอียดจำนวนนักเรียน</p>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart 
                                    data={enrollmentChartData} 
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                    onClick={(data: any) => {
                                        if (data && data.activePayload) {
                                            setSelectedEnrollDetail(data.activePayload[0].payload.raw);
                                        }
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                                    />
                                    <Bar dataKey="Total" radius={[4, 4, 0, 0]} barSize={35} cursor="pointer">
                                        {enrollmentChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border shadow-sm overflow-hidden flex flex-col min-h-[350px]">
                        {selectedEnrollDetail ? (
                            <div className="animate-fade-in flex flex-col h-full">
                                <div className="flex justify-between items-center mb-4 border-b pb-3 border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm">
                                            <UsersRound size={18}/>
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-800 text-base leading-none mb-1">ปีการศึกษา {selectedEnrollDetail.year}</h4>
                                            <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest">Detailed Statistics</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedEnrollDetail(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={18}/></button>
                                </div>
                                
                                <div className="bg-slate-900 p-3 rounded-xl mb-3 text-center shadow-lg shadow-indigo-100 border-b-2 border-slate-950">
                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.1em]">ยอดรวมนักเรียนทั้งหมด</p>
                                    <p className="text-2xl font-black text-white">{Object.values(selectedEnrollDetail.levels).reduce((acc: number, curr: any) => acc + (curr.m || 0) + (curr.f || 0), 0)} <span className="text-[10px] text-slate-400">คน</span></p>
                                </div>

                                <div className="grid grid-cols-2 gap-2 flex-1">
                                    {LEVELS.map(level => {
                                        const lvlData = selectedEnrollDetail.levels[level.id];
                                        const count = (lvlData?.m || 0) + (lvlData?.f || 0);
                                        
                                        // ตรวจสอบข้อมูลระดับมัธยม
                                        const isSecondary = level.id.includes('Matthayom');
                                        const m1 = selectedEnrollDetail.levels['Matthayom1'];
                                        const m2 = selectedEnrollDetail.levels['Matthayom2'];
                                        const m3 = selectedEnrollDetail.levels['Matthayom3'];
                                        const secondaryTotal = (m1?.m || 0) + (m1?.f || 0) + 
                                                              (m2?.m || 0) + (m2?.f || 0) + 
                                                              (m3?.m || 0) + (m3?.f || 0);
                                        
                                        if (isSecondary && secondaryTotal === 0) return null;
                                        if (count === 0) return null;

                                        return (
                                            <div key={level.id} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between group hover:bg-white hover:border-indigo-100 transition-all shadow-sm">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{level.label}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-black text-slate-800 group-hover:text-indigo-600">{count}</span>
                                                    <span className="text-[8px] font-bold text-slate-300 uppercase">คน</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center flex flex-col items-center justify-center gap-4 opacity-40 h-full py-10">
                                <div className="p-6 bg-slate-50 rounded-full border-2 border-dashed border-slate-200">
                                    <BarChartIcon size={48} className="text-slate-300"/>
                                </div>
                                <div className="space-y-1">
                                    <p className="font-black text-slate-500 uppercase tracking-widest text-xs">Analytics Ready</p>
                                    <p className="text-[9px] font-bold text-slate-400">กรุณาเลือกแท่งกราฟเพื่อดูสถิติรายระดับชั้น</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                        <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 underline underline-offset-8 decoration-pink-500 decoration-4"><BookOpen size={20} className="text-pink-500"/> คะแนนเฉลี่ย RT (ป.1)</h3>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsLineChart data={rtData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                    <Tooltip />
                                    <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                    {['การอ่านออกเสียง', 'การอ่านรู้เรื่อง'].map((subj, idx) => (
                                        <Line key={subj} type="monotone" dataKey={subj} stroke={idx === 0 ? '#ec4899' : '#f43f5e'} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                                    ))}
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                        <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 underline underline-offset-8 decoration-blue-500 decoration-4"><Target size={20} className="text-blue-500"/> คะแนนเฉลี่ย NT (ป.3)</h3>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsLineChart data={ntData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                    <Tooltip />
                                    <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                    {['ภาษาไทย', 'คณิตศาสตร์'].map((subj, idx) => (
                                        <Line key={subj} type="monotone" dataKey={subj} stroke={idx === 0 ? '#3b82f6' : '#06b6d4'} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                                    ))}
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                        <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 underline underline-offset-8 decoration-orange-500 decoration-4"><Award size={20} className="text-orange-500"/> คะแนนเฉลี่ย O-NET (ป.6)</h3>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsLineChart data={onetP6Data.length > 0 ? onetP6Data : oldOnetData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                    <Tooltip />
                                    <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                    {['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'ภาษาอังกฤษ'].map((subj, idx) => (
                                        <Line key={subj} type="monotone" dataKey={subj} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                                    ))}
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {(hasM3Students || hasM3OnetData) && (
                        <div className="bg-white p-6 rounded-3xl border shadow-sm">
                            <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 underline underline-offset-8 decoration-orange-500 decoration-4"><Award size={20} className="text-orange-500"/> คะแนนเฉลี่ย O-NET (ม.3)</h3>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsLineChart data={onetM3Data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                        <Tooltip />
                                        <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                        {['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'ภาษาอังกฤษ'].map((subj, idx) => (
                                            <Line key={subj} type="monotone" dataKey={subj} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                                        ))}
                                    </RechartsLineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                {isAcademicAdmin && (
                    <div className="flex flex-col md:flex-row justify-center gap-4">
                        <button onClick={() => { setViewMode('ENROLLMENT'); initEnrollmentForm(selectedYear); }} className="bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg"><Plus size={18}/> แก้ไขจำนวนนักเรียน</button>
                        <button onClick={() => { setViewMode('TEST_SCORES'); initScoreForm(selectedYear, selectedTestType); }} className="bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg"><Plus size={18}/> แก้ไขคะแนนสอบ</button>
                        <button onClick={() => setShowAddYearModal(true)} className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"><CalendarPlus size={18}/> จัดการปีการศึกษา</button>
                    </div>
                )}
            </div>
        );
    };

    const renderCalendar = () => {
        const filteredEvents = calendarEvents.filter(e => e.year === selectedYear);
        return (
            <div className="space-y-6 pb-20 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('DASHBOARD')} className="p-3 bg-white border rounded-2xl text-slate-400 hover:text-slate-800 transition-all"><ChevronLeft size={24}/></button>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Calendar className="text-indigo-600"/> ปฏิทินปฏิบัติงานวิชาการ</h2>
                            <p className="text-slate-400 text-xs font-bold">ปีการศึกษา {selectedYear}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="px-4 py-2 border rounded-xl font-black bg-white outline-none focus:ring-2 ring-indigo-500/20">
                            {availableYears.map(y => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
                        </select>
                        {isAcademicAdmin && <button onClick={() => setShowCalendarForm(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-sm flex-1 md:flex-none"><Plus size={18}/> เพิ่มกิจกรรม</button>}
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                    <div className="p-4 md:p-8 overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                <tr>
                                    <th className="p-4 w-[25%]">วันที่ดำเนินการ</th>
                                    <th className="p-4">รายการปฏิบัติงานวิชาการ</th>
                                    {isAcademicAdmin && <th className="p-4 w-20 text-center">จัดการ</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredEvents.length === 0 ? (
                                    <tr><td colSpan={isAcademicAdmin ? 3 : 2} className="p-20 text-center text-slate-300 font-bold italic">ไม่พบรายการกิจกรรมในปีการศึกษานี้</td></tr>
                                ) : (
                                    filteredEvents.map(event => (
                                        <tr key={event.id} className="hover:bg-slate-50 transition-all group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 font-black text-slate-600 text-sm">
                                                    <Clock size={14} className="text-indigo-400"/>
                                                    {getThaiShortDate(event.startDate)} {event.endDate !== event.startDate && ` - ${getThaiShortDate(event.endDate)}`}
                                                </div>
                                            </td>
                                            <td className="p-4 font-black text-slate-800">{event.title}</td>
                                            {isAcademicAdmin && (
                                                <td className="p-4 text-center">
                                                    <button onClick={() => handleDeleteCalendarEvent(event.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {showCalendarForm && (
                    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                        <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 animate-scale-up border-4 border-indigo-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Plus className="text-indigo-600"/> เพิ่มกิจกรรมวิชาการ</h3>
                                <button onClick={() => setShowCalendarForm(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
                            </div>
                            <form onSubmit={handleAddCalendarEvent} className="space-y-4">
                                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ชื่อกิจกรรม/รายการ</label><input required placeholder="เช่น สอบปลายภาคเรียนที่ 1..." value={newCalEvent.title} onChange={e=>setNewCalEvent({...newCalEvent, title:e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500/20"/></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ตั้งแต่วันที่</label><input type="date" required value={newCalEvent.startDate} onChange={e=>setNewCalEvent({...newCalEvent, startDate:e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500/20"/></div>
                                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ถึงวันที่</label><input type="date" required value={newCalEvent.endDate} onChange={e=>setNewCalEvent({...newCalEvent, endDate:e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500/20"/></div>
                                </div>
                                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">รายละเอียดเพิ่มเติม</label><textarea placeholder="ระบุรายละเอียดโครงการ/กิจกรรม (ถ้ามี)" value={newCalEvent.description} onChange={e=>setNewCalEvent({...newCalEvent, description:e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500/20 h-24"/></div>
                                <div className="flex gap-3 pt-4"><button type="button" onClick={()=>setShowCalendarForm(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">ยกเลิก</button><button type="submit" disabled={isSaving} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg flex items-center justify-center gap-2">{isSaving?<Loader className="animate-spin" size={18}/>:<Save size={18}/>} บันทึก</button></div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderSar = () => {
        return (
            <div className="space-y-6 pb-20 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('DASHBOARD')} className="p-3 bg-white border rounded-2xl text-slate-400 hover:text-slate-800 transition-all"><ChevronLeft size={24}/></button>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><FileText className="text-emerald-600"/> รายงานการประเมินตนเอง (SAR)</h2>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Self-Assessment Report Repository</p>
                        </div>
                    </div>
                    {isAcademicAdmin && <button onClick={() => setShowSarForm(true)} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-sm w-full md:w-auto"><Plus size={18}/> เพิ่มรายงาน SAR</button>}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                        <div className="p-6 bg-pink-50 border-b flex justify-between items-center">
                            <h3 className="font-black text-pink-900 flex items-center gap-2"><CheckCircle size={20}/> SAR ปฐมวัย</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            {sars.filter(s => s.type === 'EARLY_CHILDHOOD').length === 0 ? (
                                <p className="text-center py-10 text-slate-300 italic font-bold">ยังไม่มีข้อมูล</p>
                            ) : sars.filter(s => s.type === 'EARLY_CHILDHOOD').map(sar => (
                                <div key={sar.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group hover:bg-pink-50 transition-all border border-transparent hover:border-pink-200">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-pink-500"><FileText size={20}/></div>
                                        <div><p className="font-black text-slate-800">ปีการศึกษา {sar.year}</p><p className="text-[10px] text-slate-400 font-bold">{sar.fileName}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <a href={sar.fileUrl} target="_blank" rel="noreferrer" className="p-2 bg-white rounded-xl text-pink-600 hover:bg-pink-600 hover:text-white transition-all shadow-sm"><ExternalLink size={16}/></a>
                                        {isAcademicAdmin && (
                                            <button 
                                                onClick={async () => { 
                                                    if(confirm("ลบรายงานนี้?")) { 
                                                        const client = supabase;
                                                        if (client) {
                                                            const { error } = await client.from('academic_sar').delete().eq('id', sar.id);
                                                            if (!error) loadData(); 
                                                        }
                                                    } 
                                                }} 
                                                className="p-2 bg-white rounded-xl text-slate-300 hover:text-red-500 transition-all shadow-sm"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                        <div className="p-6 bg-blue-50 border-b flex justify-between items-center">
                            <h3 className="font-black text-blue-900 flex items-center gap-2"><CheckCircle size={20}/> SAR ขั้นพื้นฐาน</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            {sars.filter(s => s.type === 'BASIC').length === 0 ? (
                                <p className="text-center py-10 text-slate-300 italic font-bold">ยังไม่มีข้อมูล</p>
                            ) : sars.filter(s => s.type === 'BASIC').map(sar => (
                                <div key={sar.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-blue-500"><FileText size={20}/></div>
                                        <div><p className="font-black text-slate-800">ปีการศึกษา {sar.year}</p><p className="text-[10px] text-slate-400 font-bold">{sar.fileName}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <a href={sar.fileUrl} target="_blank" rel="noreferrer" className="p-2 bg-white rounded-xl text-pink-600 hover:bg-pink-600 hover:text-white transition-all shadow-sm"><ExternalLink size={16}/></a>
                                        {isAcademicAdmin && (
                                            <button 
                                                onClick={async () => { 
                                                    if(confirm("ลบรายงานนี้?")) { 
                                                        const client = supabase;
                                                        if (client) {
                                                            const { error } = await client.from('academic_sar').delete().eq('id', sar.id);
                                                            if (!error) loadData(); 
                                                        }
                                                    } 
                                                }} 
                                                className="p-2 bg-white rounded-xl text-slate-300 hover:text-red-500 transition-all shadow-sm"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {showSarForm && (
                    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                        <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 animate-scale-up border-4 border-emerald-100">
                            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3"><FileUp className="text-emerald-600"/> อัปโหลดรายงาน SAR</h3>
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ปีการศึกษา</label><select value={newSar.year} onChange={e=>setNewSar({...newSar, year:e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none">{availableYears.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
                                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ประเภท</label><select value={newSar.type} onChange={e=>setNewSar({...newSar, type:e.target.value as SARType})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none"><option value="BASIC">ขั้นพื้นฐาน</option><option value="EARLY_CHILDHOOD">ปฐมวัย</option></select></div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-100 flex gap-3">
                                    <Info className="text-blue-500 shrink-0" size={18}/>
                                    <p className="text-[10px] font-bold text-blue-700 leading-relaxed">กรุณาเลือกไฟล์ PDF รายงานฉบับสมบูรณ์ <br/>ระบบจะจัดเก็บไฟล์ไว้ใน Google Drive ของโรงเรียนอัตโนมัติ</p>
                                </div>
                                <label className={`block w-full text-center py-8 bg-slate-50 border-2 border-dashed rounded-3xl cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all ${isUploading ? 'pointer-events-none opacity-50' : ''}`}>
                                    <input type="file" className="hidden" accept="application/pdf" onChange={e => { if(e.target.files?.[0]) handleUploadSar(e.target.files[0]); }} />
                                    {isUploading ? <Loader className="animate-spin mx-auto text-indigo-600" size={32}/> : <><FileUp className="mx-auto mb-2 text-slate-400" size={32}/><span className="font-black text-slate-500 text-sm">คลิกเพื่อเลือกไฟล์ PDF</span></>}
                                </label>
                                <button onClick={()=>setShowSarForm(false)} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest transition-all">ยกเลิก</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderEnrollmentForm = () => {
        if (!tempEnrollment) return null;
        return (
            <div className="space-y-6 pb-20 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('DASHBOARD')} className="p-3 bg-white border rounded-2xl text-slate-400 hover:text-slate-800 transition-all"><ChevronLeft size={24}/></button>
                        <h2 className="text-2xl font-black text-slate-800">แก้ไขจำนวนนักเรียน</h2>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border-2 border-slate-100 shadow-inner">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ปีการศึกษา:</span>
                        <select 
                            value={tempEnrollment.year} 
                            onChange={e => initEnrollmentForm(e.target.value)}
                            className="font-bold text-slate-700 outline-none cursor-pointer bg-transparent"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] border shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {LEVELS.map(l => {
                            const currentL = tempEnrollment.levels[l.id] || { m: 0, f: 0 };
                            const sum = (currentL.m || 0) + (currentL.f || 0);
                            return (
                                <div key={l.id} className="p-4 bg-slate-50 rounded-2xl space-y-3 relative group overflow-hidden">
                                    <div className="flex justify-between items-center">
                                        <h4 className="font-black text-slate-700">{l.label}</h4>
                                        <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black shadow-sm">รวม: {sum} คน</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">ชาย</label>
                                            <input 
                                                type="number" 
                                                min="0"
                                                value={currentL.m || 0} 
                                                onChange={e => setTempEnrollment({
                                                    ...tempEnrollment, 
                                                    levels: {
                                                        ...tempEnrollment.levels,
                                                        [l.id]: { ...currentL, m: parseInt(e.target.value) || 0 }
                                                    }
                                                })}
                                                className="w-full p-3 border-2 border-white focus:border-indigo-500 rounded-xl font-bold outline-none transition-all shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">หญิง</label>
                                            <input 
                                                type="number" 
                                                min="0"
                                                value={currentL.f || 0} 
                                                onChange={e => setTempEnrollment({
                                                    ...tempEnrollment, 
                                                    levels: {
                                                        ...tempEnrollment.levels,
                                                        [l.id]: { ...currentL, f: parseInt(e.target.value) || 0 }
                                                    }
                                                })}
                                                className="w-full p-3 border-2 border-white focus:border-indigo-500 rounded-xl font-bold outline-none transition-all shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-8 flex justify-end gap-3 border-t pt-8">
                        <button onClick={() => setViewMode('DASHBOARD')} className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest transition-all hover:bg-slate-200">ยกเลิก</button>
                        <button onClick={handleSaveEnrollment} disabled={isSaving} className="px-12 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 active:scale-95 transition-all">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : <Save size={18}/>} บันทึกข้อมูล SQL
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderTestScoreForm = () => {
        if (!tempScore) return null;
        const subjects = getTestSubjects(tempScore.testType);
        return (
            <div className="space-y-6 pb-20 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('DASHBOARD')} className="p-3 bg-white border rounded-2xl text-slate-400 hover:text-slate-800 transition-all"><ChevronLeft size={24}/></button>
                        <h2 className="text-2xl font-black text-slate-800">แก้ไขคะแนน {tempScore.testType.replace('_', ' ')} ปี {tempScore.year}</h2>
                    </div>
                    <div className="flex flex-col md:flex-row gap-2">
                        <select 
                            value={tempScore.year} 
                            onChange={e => { setSelectedYear(e.target.value); initScoreForm(e.target.value, tempScore.testType); }} 
                            className="px-4 py-2 border rounded-xl font-black bg-white outline-none focus:ring-2 ring-indigo-500/20 text-xs"
                        >
                            {availableYears.map(y => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
                        </select>
                        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                            {(['RT', 'NT', 'ONET_P6', 'ONET_M3'] as TestType[]).map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => { setSelectedTestType(t); initScoreForm(tempScore.year, t); }}
                                    className={`px-4 py-2 rounded-lg font-black text-xs transition-all ${tempScore.testType === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
                                >
                                    {t.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] border shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {subjects.map(subj => (
                            <div key={subj} className="p-6 bg-slate-50 rounded-3xl space-y-2">
                                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest ml-1">{getTestSubjectLabel(subj)}</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    value={tempScore.results[subj] || 0} 
                                    onChange={e => setTempScore({
                                        ...tempScore,
                                        results: { ...tempScore.results, [subj]: parseFloat(e.target.value) || 0 }
                                    })}
                                    className="w-full p-4 border-2 border-transparent focus:border-indigo-500 rounded-2xl font-black text-2xl outline-none transition-all shadow-inner"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 flex justify-end gap-3">
                        <button onClick={() => setViewMode('DASHBOARD')} className="px-8 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">ยกเลิก</button>
                        <button onClick={handleSaveScore} disabled={isSaving} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg flex items-center justify-center gap-2">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : <Save size={18}/>} บันทึกคะแนน
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-3 animate-pulse"><Loader className="animate-spin text-indigo-600" size={32}/><p className="font-bold text-sm uppercase tracking-widest">Synchronizing Academic Records...</p></div>;

    return (
        <div className="max-w-7xl mx-auto">
            {viewMode === 'DASHBOARD' && renderDashboard()}
            {viewMode === 'ENROLLMENT' && renderEnrollmentForm()}
            {viewMode === 'TEST_SCORES' && renderTestScoreForm()}
            {viewMode === 'CALENDAR' && renderCalendar()}
            {viewMode === 'SAR' && renderSar()}

            {showAddYearModal && (
                <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 animate-scale-up border-4 border-indigo-100">
                        <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><CalendarPlus className="text-indigo-600"/> เพิ่มปีการศึกษา</h3>
                        <p className="text-xs font-bold text-slate-400 mb-6 leading-relaxed">ระบุปีการศึกษาใหม่ที่ต้องการจัดการข้อมูล <br/>เช่น 2570 เป็นต้น</p>
                        <div className="space-y-4">
                            <input 
                                type="number" 
                                placeholder="พ.ศ. (4 หลัก)" 
                                value={newYearInput}
                                onChange={e => setNewYearInput(e.target.value)}
                                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-center text-3xl outline-none focus:border-indigo-500 transition-all"
                            />
                            <div className="flex gap-3">
                                <button onClick={() => setShowAddYearModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest transition-all">ยกเลิก</button>
                                <button onClick={handleAddYear} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95">เพิ่มปี</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AcademicSystem;