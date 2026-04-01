
import React, { useState, useEffect } from 'react';
import DocumentsSystem from '../components/DocumentsSystem';
import LeaveSystem from '../components/LeaveSystem';
import FinanceSystem from '../components/FinanceSystem';
import AttendanceSystem from '../components/AttendanceSystem';
import ActionPlanSystem from '../components/ActionPlanSystem';
import AcademicSystem from '../components/AcademicSystem';
import AdminUserManagement from '../components/AdminUserManagement';
import UserProfile from '../components/UserProfile';
import LoginScreen from '../components/LoginScreen';
import FirstLoginSetup from '../components/FirstLoginSetup';
import SuperAdminDashboard from '../components/SuperAdminDashboard';
import DirectorCalendar from '../components/DirectorCalendar';
import StudentSavingsSystem from '../components/StudentSavingsSystem';
import StudentAttendanceSystem from '../components/StudentAttendanceSystem';
import { SystemView, Teacher, School, TeacherRole } from '@/types';
import { 
    Activity, Users, Clock, FileText, CalendarRange, 
    Loader, LogOut, AlertCircle,
    Settings, ChevronLeft, UserCircle, Calendar, GraduationCap, LayoutGrid, UserCheck, PiggyBank
} from 'lucide-react';
import { MOCK_TEACHERS, MOCK_SCHOOLS } from '@/constants';
import { supabase, isConfigured as isSupabaseConfigured } from '@/supabaseClient';

const SESSION_KEY = 'schoolos_session_v1';
const APP_LOGO_URL = "https://img2.pic.in.th/pic/9c2e0f8ba684e3441fc58d880fdf143d.png";

const App: React.FC = () => {
    // --- Global Data State ---
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    
    // --- Auth State ---
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- UI & Deep Link State ---
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [pendingDocCount, setPendingDocCount] = useState(0);
    const [hasDirectorMissionToday, setHasDirectorMissionToday] = useState(false);
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);

    // --- 1. DATA LOADING & REALTIME SYNC ---
    const fetchInitialData = async () => {
        console.log("App: fetchInitialData starting...");
        const client = supabase;
        if (!isSupabaseConfigured || !client) {
            console.log("App: Supabase not configured, using mock data");
            setAllSchools(MOCK_SCHOOLS);
            setAllTeachers(MOCK_TEACHERS);
            setIsDataLoaded(true);
            setIsLoading(false);
            return;
        }

        try {
            console.log("App: Fetching schools...");
            const { data: schoolsData, error: schoolsError } = await client.from('schools').select('*');
            if (schoolsError) console.error("App: Schools Fetch Error:", schoolsError);
            if (schoolsData) {
                console.log(`App: Fetched ${schoolsData.length} schools`);
                setAllSchools(schoolsData.map((s: any) => ({
                    id: s.id, 
                    name: s.name, 
                    district: s.district, 
                    province: s.province,
                    lat: s.lat, 
                    lng: s.lng, 
                    radius: s.radius, 
                    lateTimeThreshold: s.late_time_threshold, 
                    autoCheckOutEnabled: s.auto_check_out_enabled,
                    autoCheckOutTime: s.auto_check_out_time,
                    wfhModeEnabled: s.wfh_mode_enabled,
                    logoBase64: s.logo_base_64, 
                    isSuspended: s.is_suspended
                })));
            }

            console.log("App: Fetching profiles...");
            const { data: profilesData, error: profilesError } = await client.from('profiles').select('*');
            if (profilesError) console.error("App: Profiles Fetch Error:", profilesError);
            if (profilesData) {
                console.log(`App: Fetched ${profilesData.length} profiles`);
                const mappedTeachers: Teacher[] = profilesData.map((p: any) => ({
                    id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                    position: p.position, roles: (p.roles as TeacherRole[]) || [], 
                    signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                    isSuspended: p.is_suspended, isApproved: p.is_approved !== false,
                    isActingDirector: ((p.roles as string[]) || [])?.includes('ACTING_DIRECTOR') || false,
                    assignedClasses: p.assigned_classes || [],
                    isFirstLogin: false
                }));
                setAllTeachers(mappedTeachers);
                
                const storedSession = localStorage.getItem(SESSION_KEY);
                if (storedSession) {
                    try {
                        const session = JSON.parse(storedSession);
                        if (session.isSuperAdmin) {
                            setIsSuperAdminMode(true);
                        } else {
                            const user = mappedTeachers.find(t => t.id === session.userId);
                            if (user && !user.isSuspended && user.isApproved) {
                                setCurrentUser(user);
                            }
                        }
                    } catch(e) { localStorage.removeItem(SESSION_KEY); }
                }
            }
            console.log("App: Data loading complete");
            setIsDataLoaded(true);
            setIsLoading(false);
        } catch (err) {
            console.error("App: Initial Load Exception:", err);
            setIsDataLoaded(true);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();

        const client = supabase;
        if (isSupabaseConfigured && client) {
            const profileChannel = client.channel('profiles_realtime_sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload: any) => {
                    const { data } = await client.from('profiles').select('*');
                    if (data) {
                        const updatedList: Teacher[] = data.map((p: any) => ({
                            id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                            position: p.position, roles: (p.roles as TeacherRole[]) || [], 
                            signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                            isSuspended: p.is_suspended, isApproved: p.is_approved !== false,
                            isActingDirector: ((p.roles as string[]) || [])?.includes('ACTING_DIRECTOR') || false,
                            assignedClasses: p.assigned_classes || []
                        } as any));
                        setAllTeachers(updatedList);

                        const sessionStr = localStorage.getItem(SESSION_KEY);
                        if (sessionStr) {
                            const session = JSON.parse(sessionStr);
                            if (payload.new && (payload.new as any).id === session.userId) {
                                const me = updatedList.find(t => t.id === session.userId);
                                if (me) setCurrentUser(me);
                            }
                        }
                    }
                }).subscribe();

            const schoolChannel = client.channel('schools_realtime_sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'schools' }, async () => {
                    const { data } = await client.from('schools').select('*');
                    if (data) {
                        setAllSchools(data.map((s: any) => ({
                            id: s.id, 
                            name: s.name, 
                            district: s.district, 
                            province: s.province,
                            lat: s.lat, 
                            lng: s.lng, 
                            radius: s.radius, 
                            lateTimeThreshold: s.late_time_threshold, 
                            autoCheckOutEnabled: s.auto_check_out_enabled,
                            autoCheckOutTime: s.auto_check_out_time,
                            wfhModeEnabled: s.wfh_mode_enabled,
                            logoBase64: s.logo_base_64, 
                            isSuspended: s.is_suspended
                        })));
                    }
                }).subscribe();

            return () => { 
                client.removeChannel(profileChannel); 
                client.removeChannel(schoolChannel);
            };
        }
    }, []);

    // --- Deep Link Detection ---
    useEffect(() => {
        if (currentUser) {
            const params = new URLSearchParams(window.location.search);
            const viewParam = params.get('view');
            const idParam = params.get('id');
            
            if (viewParam && idParam) {
                if (Object.values(SystemView).includes(viewParam as SystemView)) {
                    setCurrentView(viewParam as SystemView);
                    setFocusItem({ view: viewParam as SystemView, id: idParam });
                }
            }
        }
    }, [currentUser]);

    // --- 2. DYNAMIC COUNTS & MISSION CHECK (Realtime) ---
    useEffect(() => {
        const client = supabase;
        if (!currentUser || !isSupabaseConfigured || !client) return;
        
        const fetchCounts = async () => {
            const { count: leaveCount } = await client.from('leave_requests').select('*', { count: 'exact', head: true }).eq('school_id', currentUser.schoolId).eq('status', 'Pending');
            setPendingLeaveCount(leaveCount || 0);

            const { data: docData } = await client.from('documents').select('status, target_teachers, acknowledged_by, assigned_vice_director_id').eq('school_id', currentUser.schoolId);
            if (docData) {
                const isDir = (currentUser.roles || []).includes('DIRECTOR');
                const isVice = (currentUser.roles || []).includes('VICE_DIRECTOR');
                let dCount = 0;
                if (isDir) dCount = docData.filter((d: any) => d.status === 'PendingDirector').length;
                else if (isVice) dCount = docData.filter((d: any) => d.status === 'PendingViceDirector' && d.assigned_vice_director_id === currentUser.id).length;
                else dCount = docData.filter((d: any) => d.status === 'Distributed' && (d.target_teachers || []).includes(currentUser.id) && !(d.acknowledged_by || []).includes(currentUser.id)).length;
                setPendingDocCount(dCount);
            }

            // Check Director Mission Today
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const { data: eventData } = await client.from('director_events').select('id').eq('school_id', currentUser.schoolId).eq('date', todayStr);
            setHasDirectorMissionToday(!!eventData && eventData.length > 0);
        };
        fetchCounts();

        const leaveSub = client.channel('counts_leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchCounts()).subscribe();
        const docSub = client.channel('counts_docs').on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => fetchCounts()).subscribe();
        
        return () => {
            client.removeChannel(leaveSub);
            client.removeChannel(docSub);
        };
    }, [currentUser?.id]);

    // --- 3. ACTION HANDLERS ---
    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleLogout = () => {
        if (!confirm("ต้องการออกจากระบบใช่หรือไม่?")) return;
        setCurrentUser(null);
        setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY);
        setCurrentView(SystemView.DASHBOARD);
    };

    const handleUpdateUserProfile = (updatedUser: Teacher) => {
        setCurrentUser(updatedUser);
        setAllTeachers(prev => prev.map(t => t.id === updatedUser.id ? updatedUser : t));
    };

    const handleUpdateSchool = async (s: School) => {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('schools').upsert([{
            id: s.id, name: s.name, district: s.district, province: s.province,
            logo_base_64: s.logoBase64, lat: s.lat, lng: s.lng, radius: s.radius,
            late_time_threshold: s.lateTimeThreshold, 
            auto_check_out_enabled: s.autoCheckOutEnabled,
            auto_check_out_time: s.autoCheckOutTime,
            wfh_mode_enabled: s.wfhModeEnabled,
            outgoing_book_prefix: s.outgoingBookPrefix,
            is_suspended: s.isSuspended || false
        }]);
        if (error) {
            console.error("Update School Error:", error.message);
            throw error;
        }
        setAllSchools(prev => prev.map(sch => sch.id === s.id ? s : sch));
    };

    const handleEditTeacher = async (t: Teacher) => {
        const client = supabase;
        if (!client) return;
        const finalRoles = t.isActingDirector 
            ? [...(t.roles || []).filter(r => r !== 'ACTING_DIRECTOR'), 'ACTING_DIRECTOR']
            : (t.roles || []).filter(r => r !== 'ACTING_DIRECTOR');

        const { error } = await client.from('profiles').update({
            name: t.name, 
            position: t.position, 
            roles: finalRoles,
            password: t.password, 
            telegram_chat_id: t.telegramChatId,
            is_suspended: t.isSuspended || false, 
            is_approved: t.isApproved !== false,
            signature_base_64: t.signatureBase64,
            assigned_classes: t.assignedClasses || []
        }).eq('id', t.id);
        
        if (error) {
            console.error("Update Teacher Error:", error.message);
            throw error;
        }

        // If this teacher is now Acting Director, unset others in the same school
        if (t.isActingDirector) {
            // We need to fetch all profiles in the school and remove the role from others
            const { data: others } = await client.from('profiles')
                .select('id, roles')
                .eq('school_id', t.schoolId)
                .neq('id', t.id);
            
            if (others) {
                for (const other of others) {
                    const otherRoles = (other.roles as string[]) || [];
                    if (otherRoles.includes('ACTING_DIRECTOR')) {
                        await client.from('profiles')
                            .update({ roles: otherRoles.filter(r => r !== 'ACTING_DIRECTOR') })
                            .eq('id', other.id);
                    }
                }
            }
        }

        setAllTeachers(prev => {
            let newList = prev.map(teacher => teacher.id === t.id ? t : teacher);
            if (t.isActingDirector) {
                newList = newList.map(teacher => 
                    (teacher.id !== t.id && teacher.schoolId === t.schoolId) 
                    ? { ...teacher, isActingDirector: false } 
                    : teacher
                );
            }
            return newList;
        });
    };

    const handleDeleteTeacher = async (id: string) => {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('profiles').delete().eq('id', id);
        if (!error) setAllTeachers(prev => prev.filter(t => t.id !== id));
    };

    // --- DASHBOARD UI COMPONENTS ---
    const currentSchool = allSchools.find(s => s.id === currentUser?.schoolId);
    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser?.schoolId);

    const DashboardCard = ({ view, title, slogan, icon: Icon, gradient, notification, hasBorder }: any) => (
        <button 
            onClick={() => setCurrentView(view)}
            className={`group relative p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-lg hover:shadow-2xl transition-all duration-700 text-left overflow-hidden flex flex-col justify-between h-56 md:h-60 hover:-translate-y-2 bg-gradient-to-br ${gradient} text-white border-none`}
        >
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.15] group-hover:opacity-[0.3] transition-opacity duration-700">
                <svg width="100%" height="100%" viewBox="0 0 300 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0,120 C80,80 220,160 300,120 L300,200 L0,200 Z" fill="white" opacity="0.6"/>
                    <path d="M-20,80 C100,30 200,130 320,80" stroke="white" strokeWidth="12" strokeLinecap="round" opacity="0.4"/>
                    <path d="M-20,100 C100,50 200,150 320,100" stroke="white" strokeWidth="6" strokeLinecap="round" opacity="0.6"/>
                </svg>
            </div>
            <div className={`absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-[0.1] group-hover:scale-125 transition-transform duration-1000 bg-white`}></div>
            <div className={`absolute left-0 bottom-0 w-32 h-32 rounded-full opacity-[0.05] blur-3xl bg-white`}></div>
            
            {notification && (
                <div className="absolute top-6 right-6 z-30 animate-bounce">
                    <div className="bg-white text-slate-900 px-4 py-2 rounded-2xl shadow-2xl border-2 border-white/50 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
                        <span className="text-[10px] md:text-xs font-black tracking-tight whitespace-nowrap">{notification}</span>
                    </div>
                </div>
            )}

            <div className="relative z-10">
                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center mb-4 md:mb-6 shadow-xl bg-white/20 backdrop-blur-md text-white transition-all duration-500 group-hover:rotate-6 group-hover:scale-110`}>
                    <Icon size={32} className="md:w-[36px] md:h-[36px]" />
                </div>
                <h3 className="text-xl md:text-2xl font-black text-white mb-1 drop-shadow-sm">{title}</h3>
                <div className="relative">
                    <p className={`text-xs md:text-sm font-bold leading-relaxed opacity-90 drop-shadow-sm`}>
                        {slogan}
                    </p>
                </div>
            </div>
            <div className="relative z-10 w-full">
                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full w-0 group-hover:w-full transition-all duration-1000 ease-out bg-white"></div>
                </div>
            </div>
            {hasBorder && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/30 rounded-b-[2rem] md:rounded-b-[2.5rem]"></div>
            )}
        </button>
    );

    const isDirector = (currentUser?.roles || []).includes('DIRECTOR') || currentUser?.isActingDirector;
    const isDocOfficer = (currentUser?.roles || []).includes('DOCUMENT_OFFICER');
    const isSystemAdmin = (currentUser?.roles || []).includes('SYSTEM_ADMIN');

    const getDocBadge = () => {
        if (pendingDocCount === 0) return null;
        if (currentUser?.roles && (currentUser.roles || []).includes('DIRECTOR')) return `มีหนังสือต้องเกษียณ ${pendingDocCount} ฉบับ`;
        if (currentUser?.roles && (currentUser.roles || []).includes('VICE_DIRECTOR')) return `มีหนังสือรอพิจารณา ${pendingDocCount} ฉบับ`;
        return `มีหนังสือเข้าใหม่ ${pendingDocCount} ฉบับ`;
    };

    if (isLoading || !isDataLoaded) {
        console.log("App: Rendering Loading Screen...");
        return <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-6 font-sarabun">
            <div className="relative">
                <div className="w-24 h-24 border-4 border-blue-100 rounded-full"></div>
                <Loader className="absolute top-0 animate-spin text-blue-600" size={96} />
            </div>
            <div className="text-center">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">SCHOOL OS</h2>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.3em] mt-1">Booting Smart Platform</p>
            </div>
        </div>;
    }
    
    if (isSuperAdminMode) {
        console.log("App: Rendering SuperAdminDashboard");
        return (
            <SuperAdminDashboard 
                schools={allSchools} teachers={allTeachers} 
                onCreateSchool={async(s: any)=> { const client = supabase; if(client) await client.from('schools').upsert([s]); setAllSchools([...allSchools, s]); }} 
                onUpdateSchool={handleUpdateSchool} 
                onDeleteSchool={async(id: any)=> { if(confirm(`ลบโรงเรียน?`)) { const client = supabase; if(client) await client.from('schools').delete().eq('id', id); setAllSchools(allSchools.filter(s => s.id !== id)); } }} 
                onUpdateTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher}
                onLogout={handleLogout} 
            />
        );
    }

    if (!currentUser) {
        console.log("App: Rendering LoginScreen");
        return <LoginScreen schools={allSchools} teachers={allTeachers} onLogin={handleLogin} onRegister={async (sid: any, id: any, n: any) => {
            const client = supabase;
            if (!client) return;
            const { error } = await client.from('profiles').insert([{ 
                id, 
                school_id: sid, 
                name: n, 
                password: '123456', 
                position: 'ครู', 
                roles: ['TEACHER'], 
                is_suspended: false,
                is_approved: false 
            }]);
            if (!error) { await fetchInitialData(); } else { alert(error.message); }
        }} onSuperAdminLogin={()=>setIsSuperAdminMode(true)} />;
    }
    
    if (currentUser.isFirstLogin) return <FirstLoginSetup user={currentUser} onComplete={async (p: any, pos: any) => {
        const client = supabase;
        if (!client) return;
        const roles = pos.includes('ผู้อำนวยการ') ? ['DIRECTOR', 'TEACHER'] : currentUser.roles;
        await client.from('profiles').update({ password: p, position: pos, roles }).eq('id', currentUser.id);
        await fetchInitialData();
    }} onLogout={handleLogout} />;

    return (
        <div className="flex flex-col min-h-screen bg-[#f8fafc] font-sarabun relative overflow-x-hidden">
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
                <svg width="100%" height="100%" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                    <path d="M0,200 C300,100 600,300 900,200 T1440,250" stroke="#3b82f6" fill="transparent" strokeWidth="3" />
                    <path d="M-100,450 C200,350 500,550 800,450 S1200,350 1540,450" stroke="#6366f1" fill="transparent" strokeWidth="2" />
                    <path d="M0,700 C400,600 800,800 1200,700 T1600,750" stroke="#8b5cf6" fill="transparent" strokeWidth="4" />
                </svg>
            </div>
            <header className="bg-white/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-100 h-20 flex items-center shadow-sm print:hidden">
                <div className="max-w-7xl mx-auto w-full px-4 md:px-8 flex justify-between items-center">
                    <div className="flex items-center gap-2 md:gap-6">
                        {currentView !== SystemView.DASHBOARD ? (
                            <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className="p-2 md:p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all">
                                <ChevronLeft size={20} className="md:w-[24px] md:h-[24px]"/>
                            </button>
                        ) : (
                            <div className="p-2 md:p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                <LayoutGrid size={20} className="md:w-[24px] md:h-[24px]"/>
                            </div>
                        )}
                        <div className="flex flex-col">
                            <h1 className="text-lg md:text-2xl font-black text-slate-800 tracking-tight leading-none">
                                {currentView === SystemView.DASHBOARD ? 'ระบบบริหารโรงเรียน' : 'ระบบจัดการโรงเรียน'}
                            </h1>
                            {currentView === SystemView.DASHBOARD && (
                                <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-[0.1em] mt-0.5">
                                    School Management System
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-6">
                        <div className="hidden md:flex flex-col items-end">
                            <span className="text-sm font-black text-slate-800 leading-none">{currentUser.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 tracking-widest">{currentUser.position}</span>
                        </div>
                        <div onClick={() => setCurrentView(SystemView.PROFILE)} className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-blue-600 flex items-center justify-center text-white font-black cursor-pointer hover:scale-110 transition-all shadow-lg shadow-blue-500/20">
                            {currentUser.name[0]}
                        </div>
                        <button onClick={handleLogout} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <LogOut size={20} className="md:w-[24px] md:h-[24px]"/>
                        </button>
                    </div>
                </div>
            </header>
            <main className="flex-1 w-full p-4 md:p-8 relative z-10">
                <div className="max-w-7xl mx-auto">
                    {currentView === SystemView.DASHBOARD ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 animate-fade-in">
                            {/* Dashboard Cards with original intense gradients */}
                            <DashboardCard 
                                view={SystemView.DOCUMENTS} 
                                title="งานสารบรรณ" 
                                slogan="รับ-ส่ง รวดเร็ว ทันใจ" 
                                icon={FileText} 
                                gradient="from-cyan-400 to-blue-600" 
                                notification={getDocBadge()} 
                                hasBorder={true}
                            />
                            {(isDirector || isDocOfficer || isSystemAdmin || (currentUser?.roles || []).includes('TEACHER')) && (
                                <DashboardCard 
                                    view={SystemView.DIRECTOR_CALENDAR} 
                                    title="ปฏิทินปฏิบัติงาน ผอ." 
                                    slogan="แจ้งเตือนนัดหมาย และภารกิจ" 
                                    notification={hasDirectorMissionToday ? "มีภารกิจวันนี้" : null}
                                    icon={Calendar} 
                                    gradient="from-blue-500 to-indigo-700"
                                />
                            )}
                            <DashboardCard view={SystemView.ACADEMIC} title="งานวิชาการ" slogan="สถิตินักเรียน / ผลสอบ O-NET" icon={GraduationCap} gradient="from-indigo-500 to-purple-700"/>
                            <DashboardCard view={SystemView.STUDENT_ATTENDANCE} title="ระบบดูแลช่วยเหลือนักเรียน" slogan="เช็คชื่อ / ข้อมูลพื้นฐานนักเรียน" icon={UserCheck} gradient="from-emerald-500 to-teal-600"/>
                            <DashboardCard view={SystemView.SAVINGS} title="ออมทรัพย์นักเรียน" slogan="บันทึกเงินออมนักเรียน" icon={PiggyBank} gradient="from-pink-500 to-rose-600"/>
                            <DashboardCard view={SystemView.PLAN} title="แผนปฏิบัติการ" slogan="วางแผนแม่นยำ สู่ความสำเร็จ" icon={CalendarRange} gradient="from-fuchsia-500 to-purple-700"/>
                            <DashboardCard 
                                view={SystemView.LEAVE} 
                                title="ระบบการลา" 
                                slogan="โปร่งใส ตรวจสอบง่าย" 
                                icon={UserCheck} 
                                gradient="from-emerald-400 to-teal-600" 
                                notification={pendingLeaveCount > 0 ? `รออนุมัติ ${pendingLeaveCount}` : null}
                            />
                            <DashboardCard view={SystemView.ATTENDANCE} title="ลงเวลาทำงาน" slogan="เช็คเวลาแม่นยำ ด้วย GPS" icon={Clock} gradient="from-rose-400 to-red-600"/>
                            <DashboardCard view={SystemView.FINANCE} title="ระบบการเงิน" slogan="งบประมาณ และรายรับ-จ่าย" icon={Activity} gradient="from-amber-400 to-orange-600"/>
                            {currentUser?.roles && (currentUser.roles || []).includes('SYSTEM_ADMIN') && (
                                <DashboardCard view={SystemView.ADMIN_USERS} title="ผู้ดูแลระบบ" slogan="ตั้งค่าระบบ และผู้ใช้งาน" icon={Settings} gradient="from-slate-500 to-slate-700"/>
                            )}
                            <DashboardCard view={SystemView.PROFILE} title="ข้อมูลส่วนตัว" slogan="แก้ไขรหัสผ่าน / ลายเซ็นดิจิทัล" icon={UserCircle} gradient="from-violet-400 to-indigo-600"/>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            {(() => {
                                switch (currentView) {
                                    case SystemView.PROFILE: return <UserProfile currentUser={currentUser} onUpdateUser={handleUpdateUserProfile} />;
                                    case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser} currentSchool={currentSchool!} allTeachers={schoolTeachers} focusDocId={focusItem?.id} onClearFocus={() => setFocusItem(null)} />;
                                    case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool!} focusRequestId={focusItem?.id} onClearFocus={() => setFocusItem(null)} />;
                                    case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
                                    case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool!} />;
                                    case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser} currentSchool={currentSchool!} />;
                                    case SystemView.ACADEMIC: return <AcademicSystem currentUser={currentUser} />;
                                    case SystemView.SAVINGS: return <StudentSavingsSystem currentUser={currentUser} />;
                                    case SystemView.STUDENT_ATTENDANCE: return <StudentAttendanceSystem currentUser={currentUser} />;
                                    case SystemView.ADMIN_USERS: 
                                        if (!currentUser?.roles || !(currentUser.roles || []).includes('SYSTEM_ADMIN')) {
                                            setCurrentView(SystemView.DASHBOARD);
                                            return null;
                                        }
                                        return <AdminUserManagement teachers={schoolTeachers} currentSchool={currentSchool!} onUpdateSchool={handleUpdateSchool} 
                                            onAddTeacher={async (t: any) => { 
                                            const client = supabase; 
                                            if(!client) return;
                                            const finalRoles = t.isActingDirector 
                                                ? [...(t.roles || []).filter((r: any) => r !== 'ACTING_DIRECTOR'), 'ACTING_DIRECTOR']
                                                : (t.roles || []).filter((r: any) => r !== 'ACTING_DIRECTOR');

                                            const { error } = await client.from('profiles').insert([{ 
                                                id: t.id,
                                                school_id: t.schoolId,
                                                name: t.name,
                                                password: t.password,
                                                position: t.position,
                                                roles: finalRoles,
                                                signature_base_64: t.signatureBase64,
                                                telegram_chat_id: t.telegramChatId,
                                                is_suspended: t.isSuspended || false,
                                                is_approved: t.isApproved !== false,
                                                assigned_classes: t.assignedClasses || []
                                            }]); 
                                            if (error) {
                                                console.error("Add Teacher Error:", error.message);
                                                throw error;
                                            }

                                            // If this teacher is now Acting Director, unset others in the same school
                                            if (t.isActingDirector) {
                                                const { data: others } = await client.from('profiles')
                                                    .select('id, roles')
                                                    .eq('school_id', t.schoolId)
                                                    .neq('id', t.id);
                                                
                                                if (others) {
                                                    for (const other of others) {
                                                        const otherRoles = (other.roles as string[]) || [];
                                                        if (otherRoles.includes('ACTING_DIRECTOR')) {
                                                            await client.from('profiles')
                                                                .update({ roles: otherRoles.filter(r => r !== 'ACTING_DIRECTOR') })
                                                                .eq('id', other.id);
                                                        }
                                                    }
                                                }
                                            }

                                            setAllTeachers(prev => {
                                                let newList = [...prev, t];
                                                if (t.isActingDirector) {
                                                    newList = newList.map(teacher => 
                                                        (teacher.id !== t.id && teacher.schoolId === t.schoolId) 
                                                        ? { ...teacher, isActingDirector: false } 
                                                        : teacher
                                                    );
                                                }
                                                return newList;
                                            });
                                        }} 
                                        onEditTeacher={handleEditTeacher} 
                                        onDeleteTeacher={handleDeleteTeacher} />;
                                    case SystemView.DIRECTOR_CALENDAR: return <DirectorCalendar currentUser={currentUser} allTeachers={schoolTeachers} />;
                                    default: return null;
                                }
                            })()}
                        </div>
                    )}
                </div>
            </main>
            <footer className="h-16 bg-white border-t border-slate-100 flex items-center print:hidden mt-auto">
                <div className="max-w-7xl mx-auto w-full px-8 flex justify-between items-center opacity-60">
                    <div className="flex items-center gap-3">
                        {currentSchool?.logoBase64 ? (
                            <img src={currentSchool.logoBase64} className="w-6 h-6 object-contain" alt="School Logo" />
                        ) : (
                            <img src={APP_LOGO_URL} className="w-6 h-6 object-contain grayscale" alt="OS Logo"/>
                        )}
                        <span className="font-black text-slate-600 text-xs md:text-sm uppercase tracking-tight">{currentSchool?.name ? `ระบบจัดการโรงเรียน ${currentSchool.name}` : 'ระบบบริหารโรงเรียน SchoolOS'}</span>
                    </div>
                    <div className="hidden md:block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ลิขสิทธิ์โดย สยาม  เชียงเครือ</div>
                </div>
            </footer>
        </div>
    );
};

export default App;
