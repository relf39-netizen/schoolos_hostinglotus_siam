import React, { useState, useEffect } from 'react';
import { School, Teacher, TeacherRole } from '@/types';
import { 
    Building, Plus, LogOut, X, Trash2, 
    Loader2, ShieldCheck, Save, Shield, 
    Search, Users, Power, PowerOff, 
    ArrowLeft, Edit, Key, User as UserIcon, Eye, EyeOff,
    Clock, Check, ShieldPlus, UserMinus, Database,
    ArrowRight, AlertCircle, Download, Settings
} from 'lucide-react';
import { supabase, isConfigured as isSupabaseConfigured } from '@/supabaseClient';

interface SuperAdminDashboardProps {
    schools: School[];
    teachers: Teacher[];
    onCreateSchool: (school: School) => Promise<void>;
    onUpdateSchool: (school: School) => Promise<void>;
    onDeleteSchool: (schoolId: string) => Promise<void>;
    onUpdateTeacher: (teacher: Teacher) => Promise<void>;
    onDeleteTeacher: (teacherId: string) => Promise<void>;
    onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ 
    schools, teachers, onCreateSchool, onUpdateSchool, onDeleteSchool, 
    onUpdateTeacher, onDeleteTeacher, onLogout 
}) => {
    const [activeTab, setActiveTab] = useState<'SCHOOLS' | 'PENDING' | 'ACCOUNT' | 'MIGRATION'>('SCHOOLS');
    const [showForm, setShowForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [formData, setFormData] = useState<Partial<School>>({ id: '', name: '' });
    const [isSavingSchool, setIsSavingSchool] = useState(false);
    const [schoolSearch, setSchoolSearch] = useState('');
    const [teacherSearch, setTeacherSearch] = useState('');
    
    // Account Management State
    const [superAdminData, setSuperAdminData] = useState({ username: '', password: '' });
    const [oldUsername, setOldUsername] = useState('');
    const [showAdminPassword, setShowAdminPassword] = useState(false);
    const [isSavingAccount, setIsSavingAccount] = useState(false);

    // Migration State
    const [migrationConfig, setMigrationConfig] = useState({ url: '', key: '' });
    const [isMigrating, setIsMigrating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isFixingSchema, setIsFixingSchema] = useState(false);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [migrationStatus, setMigrationStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
    const [migrationProgress, setMigrationProgress] = useState<Record<string, string>>({});

    // School detail view
    const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
    const [isUpdatingTeacher, setIsUpdatingTeacher] = useState<string | null>(null);

    useEffect(() => {
        const fetchSuperAdmin = async () => {
            const client = supabase;
            if (isSupabaseConfigured && client) {
                const { data } = await client.from('super_admins').select('*').limit(1).maybeSingle();
                if (data) {
                    setSuperAdminData({ username: data.username, password: data.password });
                    setOldUsername(data.username);
                }
            }
        };
        fetchSuperAdmin();
    }, []);

    const filteredSchools = schools.filter(s => 
        s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || 
        s.id.includes(schoolSearch)
    );

    // Filter only those who are not approved yet
    const pendingGlobalUsers = teachers.filter(t => t.isApproved === false);
    
    const currentSchoolObj = schools.find(s => s.id === selectedSchoolId);
    const schoolStaff = teachers.filter(t => t.schoolId === selectedSchoolId)
        .filter(t => t.name.toLowerCase().includes(teacherSearch.toLowerCase()) || t.id.includes(teacherSearch));

    const handleSchoolSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.id || !formData.name) return;
        setIsSavingSchool(true);
        try {
            if (isEditMode) await onUpdateSchool(formData as School);
            else await onCreateSchool(formData as School);
            setShowForm(false);
            setFormData({ id: '', name: '' });
        } catch (error) {
            alert("บันทึกไม่สำเร็จ");
        } finally {
            setIsSavingSchool(false);
        }
    };

    const handleAccountUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        if (!confirm("ยืนยันการเปลี่ยนข้อมูลเข้าสู่ระบบ Super Admin?")) return;
        setIsSavingAccount(true);
        try {
            if (superAdminData.username !== oldUsername) {
                await client.from('super_admins').delete().eq('username', oldUsername);
            }
            const { error } = await client.from('super_admins').upsert({
                username: superAdminData.username,
                password: superAdminData.password
            });
            if (!error) {
                alert("อัปเดตบัญชีสำเร็จ");
                setOldUsername(superAdminData.username);
            }
        } finally {
            setIsSavingAccount(false);
        }
    };

    const handleApproveAsAdmin = async (teacher: Teacher) => {
        if (!isSupabaseConfigured || !supabase) return;
        if (!confirm(`ยืนยันการอนุมัติและแต่งตั้งคุณ "${teacher.name}" เป็นผู้ดูแลระบบ (Admin) ของโรงเรียนนี้?`)) return;

        setIsUpdatingTeacher(teacher.id);
        // Ensure SYSTEM_ADMIN is included in roles
        const newRoles: TeacherRole[] = Array.from(new Set([...teacher.roles, 'SYSTEM_ADMIN']));
        
        try {
            const { error } = await supabase.from('profiles').update({ 
                is_approved: true,
                roles: newRoles 
            }).eq('id', teacher.id);

            if (!error) {
                await onUpdateTeacher({ ...teacher, isApproved: true, roles: newRoles });
                alert("อนุมัติและแต่งตั้ง Admin สำเร็จ บัญชีพร้อมใช้งานแล้ว");
            } else throw error;
        } catch (err: any) {
            alert("ขัดข้อง: " + err.message);
        } finally {
            setIsUpdatingTeacher(null);
        }
    };

    const handleToggleTeacherAdmin = async (teacher: Teacher) => {
        if (!isSupabaseConfigured || !supabase) return;
        const hasAdmin = teacher.roles.includes('SYSTEM_ADMIN');
        let newRoles: TeacherRole[] = hasAdmin 
            ? teacher.roles.filter(r => r !== 'SYSTEM_ADMIN') 
            : [...teacher.roles, 'SYSTEM_ADMIN'];
        
        if (!confirm(`ยืนยันการ${hasAdmin ? 'ถอนสิทธิ์' : 'แต่งตั้ง'}แอดมิน: ${teacher.name}?`)) return;

        setIsUpdatingTeacher(teacher.id);
        const { error } = await supabase.from('profiles').update({ roles: newRoles }).eq('id', teacher.id);
        if (!error) await onUpdateTeacher({ ...teacher, roles: newRoles });
        setIsUpdatingTeacher(null);
    };

    const handleToggleSchoolSuspension = async (school: School) => {
        if (!isSupabaseConfigured || !supabase) return;
        const newStatus = !school.isSuspended;
        if (!confirm(`ยืนยันการ${newStatus ? 'ระงับ' : 'เปิด'}การใช้งานโรงเรียน: ${school.name}?`)) return;
        const { error } = await supabase.from('schools').update({ is_suspended: newStatus }).eq('id', school.id);
        if (!error) await onUpdateSchool({ ...school, isSuspended: newStatus });
    };

    const handleTestConnection = async () => {
        if (!migrationConfig.url || !migrationConfig.key) {
            alert("กรุณาระบุ Supabase URL และ Service Role Key");
            return;
        }

        if (!migrationConfig.url.startsWith('https://')) {
            alert("Supabase URL ต้องขึ้นต้นด้วย https://");
            return;
        }

        // Check if it's a dashboard URL instead of API URL
        if (migrationConfig.url.includes('supabase.com/dashboard')) {
            alert("❌ คุณกำลังใช้ Dashboard URL กรุณาใช้ API URL (Project URL) จากหน้า Settings > API ใน Supabase\nตัวอย่าง: https://xxxx.supabase.co");
            return;
        }

        setIsTestingConnection(true);
        try {
            const baseUrl = migrationConfig.url.endsWith('/') ? migrationConfig.url.slice(0, -1) : migrationConfig.url;
            // Test by fetching a single row from 'schools' or any common table
            const response = await fetch(`${baseUrl}/rest/v1/schools?select=id&limit=1`, {
                headers: {
                    'apikey': migrationConfig.key,
                    'Authorization': `Bearer ${migrationConfig.key}`,
                    'Content-Type': 'application/json'
                }
            });

            const text = await response.text();
            
            if (response.ok) {
                try {
                    JSON.parse(text);
                    alert("✅ เชื่อมต่อสำเร็จ! URL และ Key ถูกต้อง");
                } catch (e) {
                    alert(`❌ เชื่อมต่อได้แต่ข้อมูลไม่ใช่ JSON (อาจระบุ URL ผิด)\nSnippet: ${text.substring(0, 100)}`);
                }
            } else {
                alert(`❌ เชื่อมต่อล้มเหลว (${response.status})\nตรวจสอบว่าใช้ API URL (ไม่ใช่ Dashboard URL) และ Key ถูกต้อง\nError: ${text.substring(0, 100)}`);
            }
        } catch (err: any) {
            alert(`❌ เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`);
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleFixSchema = async () => {
        if (!confirm("ยืนยันการตรวจสอบและแก้ไขโครงสร้างฐานข้อมูล? ระบบจะสร้างตารางที่ขาดหายไปโดยไม่กระทบข้อมูลเดิม")) return;
        setIsFixingSchema(true);
        try {
            const response = await fetch('/api/maintenance/fix-schema', { method: 'POST' });
            const result = await response.json();
            if (result.success) {
                alert("แก้ไขโครงสร้างฐานข้อมูลสำเร็จ: " + result.message);
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            alert("ขัดข้อง: " + err.message);
        } finally {
            setIsFixingSchema(false);
        }
    };

    const handleDataMigration = async () => {
        if (!migrationConfig.url || !migrationConfig.key) {
            alert("กรุณาระบุ Supabase URL และ Service Role Key");
            return;
        }
        if (!confirm("ยืนยันการเริ่มย้ายข้อมูล? ข้อมูลเดิมใน MySQL จะถูกเขียนทับหากมี ID ซ้ำกัน และขั้นตอนนี้อาจใช้เวลาสักครู่")) return;

        setIsMigrating(true);
        const tables = [
            'schools', 'profiles', 'academic_calendar', 'academic_enrollments', 
            'academic_sar', 'academic_test_scores', 'academic_years', 'attendance', 
            'budget_settings', 'class_rooms', 'director_events', 'documents', 
            'finance_accounts', 'finance_transactions', 'leave_requests', 
            'plan_projects', 'school_configs', 'students', 'student_attendance', 
            'student_health_records', 'student_savings', 'super_admins'
        ];

        const initialStatus: Record<string, 'idle' | 'loading' | 'success' | 'error'> = {};
        const initialProgress: Record<string, string> = {};
        tables.forEach(t => {
            initialStatus[t] = 'idle';
            initialProgress[t] = 'Waiting...';
        });
        setMigrationStatus(initialStatus);
        setMigrationProgress(initialProgress);

        for (const table of tables) {
            setMigrationStatus(prev => ({ ...prev, [table]: 'loading' }));
            setMigrationProgress(prev => ({ ...prev, [table]: 'กำลังดึงข้อมูลจาก Supabase...' }));
            
            try {
                // Using standard fetch to Supabase REST API to avoid dependency issues
                const baseUrl = migrationConfig.url.endsWith('/') ? migrationConfig.url.slice(0, -1) : migrationConfig.url;
                const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*`, {
                    headers: {
                        'apikey': migrationConfig.key,
                        'Authorization': `Bearer ${migrationConfig.key}`,
                        'Content-Type': 'application/json'
                    }
                });

                const text = await response.text();

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
                }

                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(`ได้รับข้อมูลเป็น HTML แทน JSON (อาจระบุ URL ผิด) Snippet: ${text.substring(0, 100)}`);
                }

                if (data && data.length > 0) {
                    setMigrationProgress(prev => ({ ...prev, [table]: `กำลังนำเข้าข้อมูล ${data.length} รายการ...` }));
                    // Using the mock supabase client which points to our MySQL API
                    const { error: upsertError } = await supabase.from(table).upsert(data);
                    if (upsertError) throw upsertError;
                    
                    setMigrationStatus(prev => ({ ...prev, [table]: 'success' }));
                    setMigrationProgress(prev => ({ ...prev, [table]: `เสร็จสิ้น (${data.length} รายการ)` }));
                } else {
                    setMigrationStatus(prev => ({ ...prev, [table]: 'success' }));
                    setMigrationProgress(prev => ({ ...prev, [table]: 'ไม่พบข้อมูล' }));
                }
            } catch (err: any) {
                console.error(`Migration error (${table}):`, err);
                setMigrationStatus(prev => ({ ...prev, [table]: 'error' }));
                setMigrationProgress(prev => ({ ...prev, [table]: err.message }));
            }
        }
        setIsMigrating(false);
        alert("การย้ายข้อมูลเสร็จสิ้น กรุณารีเฟรชหน้าเว็บเพื่อดูข้อมูลใหม่");
    };

    const handleExportSQL = async () => {
        if (!migrationConfig.url || !migrationConfig.key) {
            alert("กรุณาระบุ Supabase URL และ Service Role Key");
            return;
        }

        setIsExporting(true);
        const tables = [
            'schools', 'profiles', 'academic_calendar', 'academic_enrollments', 
            'academic_sar', 'academic_test_scores', 'academic_years', 'attendance', 
            'budget_settings', 'class_rooms', 'director_events', 'documents', 
            'finance_accounts', 'finance_transactions', 'leave_requests', 
            'plan_projects', 'school_configs', 'students', 'student_attendance', 
            'student_health_records', 'student_savings', 'super_admins'
        ];

        let fullSql = "-- SchoolOS Data Migration Export\n";
        fullSql += "-- Generated on: " + new Date().toLocaleString() + "\n";
        fullSql += "SET NAMES utf8mb4;\n";
        fullSql += "SET FOREIGN_KEY_CHECKS = 0;\n\n";

        try {
            const baseUrl = migrationConfig.url.endsWith('/') ? migrationConfig.url.slice(0, -1) : migrationConfig.url;

            for (const table of tables) {
                setMigrationStatus(prev => ({ ...prev, [table]: 'loading' }));
                setMigrationProgress(prev => ({ ...prev, [table]: 'กำลังดึงข้อมูลเพื่อส่งออก...' }));

                try {
                    const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*`, {
                        headers: {
                            'apikey': migrationConfig.key,
                            'Authorization': `Bearer ${migrationConfig.key}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const text = await response.text();

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
                    }

                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        throw new Error(`ได้รับข้อมูลเป็น HTML แทน JSON (อาจเป็นหน้า Error ของ Hosting หรือ URL ผิด) Snippet: ${text.substring(0, 100)}`);
                    }

                    if (data && data.length > 0) {
                        fullSql += `-- Data for table: ${table}\n`;
                        fullSql += `DELETE FROM \`${table}\`;\n`; 
                        
                        for (const row of data) {
                            const keys = Object.keys(row);
                            const values = keys.map(key => {
                                const val = row[key];
                                if (val === null || val === undefined) return 'NULL';
                                if (typeof val === 'boolean') return val ? '1' : '0';
                                if (typeof val === 'object') {
                                    const jsonStr = JSON.stringify(val).replace(/\\/g, "\\\\").replace(/'/g, "''");
                                    return `'${jsonStr}'`;
                                }
                                if (typeof val === 'string') {
                                    // ตรวจสอบว่าเป็น ISO 8601 timestamp หรือไม่ (เช่น 2025-12-23T14:48:02.678137+00:00)
                                    // MySQL ต้องการรูปแบบ YYYY-MM-DD HH:MM:SS
                                    if (val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                                        const formattedDate = val.replace('T', ' ').split('.')[0].split('+')[0].split('Z')[0];
                                        return `'${formattedDate}'`;
                                    }
                                    return `'${val.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
                                }
                                return val;
                            });

                            fullSql += `INSERT INTO \`${table}\` (\`${keys.join('`, `')}\`) VALUES (${values.join(', ')});\n`;
                        }
                        fullSql += "\n";
                        setMigrationStatus(prev => ({ ...prev, [table]: 'success' }));
                        setMigrationProgress(prev => ({ ...prev, [table]: `ส่งออกแล้ว (${data.length} รายการ)` }));
                    } else {
                        setMigrationStatus(prev => ({ ...prev, [table]: 'success' }));
                        setMigrationProgress(prev => ({ ...prev, [table]: 'ไม่พบข้อมูล' }));
                    }
                } catch (tableErr: any) {
                    console.error(`Export error for ${table}:`, tableErr);
                    setMigrationStatus(prev => ({ ...prev, [table]: 'error' }));
                    setMigrationProgress(prev => ({ ...prev, [table]: tableErr.message }));
                    // ไม่หยุดการทำงาน ให้ทำตารางถัดไปต่อ
                }
            }

            fullSql += "SET FOREIGN_KEY_CHECKS = 1;\n";

            // Trigger Download
            const blob = new Blob([fullSql], { type: 'text/sql' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `schoolos_migration_${new Date().getTime()}.sql`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert("ส่งออกไฟล์ SQL สำเร็จ! คุณสามารถนำไฟล์นี้ไป Import ใน phpMyAdmin ได้เลยครับ");
        } catch (err: any) {
            console.error("Export error:", err);
            alert("การส่งออกขัดข้อง: " + err.message);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sarabun text-slate-900">
            <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-30">
                <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl">S</div>
                        <div>
                            <h1 className="text-lg font-bold leading-none">Super Admin</h1>
                            <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Platform Core Dashboard</span>
                        </div>
                    </div>
                    <div className="hidden md:flex bg-slate-800 p-1 rounded-xl">
                        <button onClick={() => { setActiveTab('SCHOOLS'); setSelectedSchoolId(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SCHOOLS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>จัดการโรงเรียน</button>
                        <button onClick={() => { setActiveTab('PENDING'); setSelectedSchoolId(null); }} className={`relative px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'PENDING' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>
                            คำขอแอดมินใหม่
                            {pendingGlobalUsers.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full animate-pulse">{pendingGlobalUsers.length}</span>}
                        </button>
                        <button onClick={() => { setActiveTab('MIGRATION'); setSelectedSchoolId(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'MIGRATION' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>ย้ายข้อมูล</button>
                        <button onClick={() => { setActiveTab('ACCOUNT'); setSelectedSchoolId(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ACCOUNT' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>ตั้งค่าบัญชี</button>
                    </div>
                    <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-400 transition-colors flex items-center gap-2 font-bold">
                        <span className="text-xs">LOGOUT</span>
                        <LogOut size={20}/>
                    </button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-6">
                {activeTab === 'SCHOOLS' && !selectedSchoolId && (
                    <div className="animate-fade-in space-y-6">
                        <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-2xl border shadow-sm items-center">
                            <div className="flex-1 w-full md:max-w-sm relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                <input type="text" placeholder="ค้นหาโรงเรียน..." value={schoolSearch} onChange={e => setSchoolSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500/10 font-bold text-sm" />
                            </div>
                            <button onClick={() => { setFormData({id:'', name:''}); setIsEditMode(false); setShowForm(true); }} className="bg-blue-600 text-white px-6 py-2 rounded-xl shadow-md hover:bg-blue-700 font-bold flex items-center justify-center gap-2 transition-all active:scale-95 text-xs">
                                <Plus size={16}/> เพิ่มโรงเรียนใหม่
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredSchools.map(s => (
                                <div key={s.id} className={`bg-white rounded-[2rem] border-2 transition-all overflow-hidden flex flex-col ${s.isSuspended ? 'border-red-100 bg-red-50/10 grayscale' : 'border-slate-100 hover:border-blue-200 shadow-sm'}`}>
                                    <div className="p-6 flex-1">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className={`p-4 rounded-2xl ${s.isSuspended ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}><Building size={28}/></div>
                                            <span className="text-[10px] font-black font-mono bg-slate-100 p-1.5 rounded px-2 text-slate-500">{s.id}</span>
                                        </div>
                                        <h3 className="font-bold text-lg text-slate-800 truncate mb-1">{s.name}</h3>
                                        <p className="text-xs text-slate-400 font-bold flex items-center gap-1"><Users size={12}/> {teachers.filter(t => t.schoolId === s.id).length} บุคลากร</p>
                                    </div>
                                    <div className="bg-slate-50 p-4 border-t flex justify-between items-center">
                                        <button onClick={() => setSelectedSchoolId(s.id)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black shadow-md hover:bg-blue-700 transition-all">ดูบุคลากร</button>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setFormData(s); setIsEditMode(true); setShowForm(true); }} className="p-2 bg-white border rounded-xl text-slate-500 hover:text-blue-600 transition-all"><Edit size={16}/></button>
                                            <button onClick={() => handleToggleSchoolSuspension(s)} className={`p-2 border rounded-xl transition-all ${s.isSuspended ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 hover:text-red-600'}`}>{s.isSuspended ? <Power size={16}/> : <PowerOff size={16}/>}</button>
                                            <button onClick={() => { if(confirm("ลบโรงเรียนนี้ถาวร?")) onDeleteSchool(s.id); }} className="p-2 bg-white border rounded-xl text-slate-300 hover:text-red-600 transition-all"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'PENDING' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
                            <div className="bg-amber-500 p-8 text-white">
                                <h2 className="text-2xl font-black mb-1 flex items-center gap-3"><ShieldCheck size={28}/> คำขออนุมัติแอดมินใหม่</h2>
                                <p className="text-amber-50 text-xs opacity-90 font-bold">อนุมัติผู้สมัครและแต่งตั้งเป็นผู้ดูแลระบบ (SYSTEM_ADMIN) ของโรงเรียนเพื่อให้บัญชีใช้งานได้ทันที</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                        <tr><th className="p-6">ชื่อ-นามสกุล</th><th className="p-6">โรงเรียน</th><th className="p-6 text-right">ดำเนินการ</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {pendingGlobalUsers.length === 0 ? (<tr><td colSpan={3} className="p-20 text-center text-slate-300 font-bold italic">ไม่มีรายการค้างอนุมัติ</td></tr>) : pendingGlobalUsers.map(t => (
                                            <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-6"><div className="font-bold text-slate-700">{t.name}</div><div className="text-[10px] font-mono text-slate-400">ID: {t.id}</div></td>
                                                <td className="p-6"><div className="font-bold text-slate-800 text-sm">{schools.find(s => s.id === t.schoolId)?.name || 'ไม่พบโรงเรียน'}</div><div className="text-[10px] text-slate-400 font-black">Code: {t.schoolId}</div></td>
                                                <td className="p-6 text-right">
                                                    <button onClick={() => handleApproveAsAdmin(t)} disabled={isUpdatingTeacher === t.id} className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 ml-auto">
                                                        {isUpdatingTeacher === t.id ? <Loader2 className="animate-spin" size={14}/> : <Check size={14}/>} อนุมัติเป็นแอดมินโรงเรียน
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'ACCOUNT' && (
                    <div className="animate-fade-in max-w-md mx-auto">
                        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-8 space-y-8">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-slate-900 text-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl"><Shield size={32}/></div>
                                <h2 className="text-xl font-black">บัญชี Super Admin</h2>
                                <p className="text-xs text-slate-400 font-bold">แก้ไขข้อมูลการเข้าถึงระบบส่วนกลาง</p>
                            </div>
                            <form onSubmit={handleAccountUpdate} className="space-y-6">
                                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Username</label><div className="relative"><UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/><input type="text" required value={superAdminData.username} onChange={e => setSuperAdminData({...superAdminData, username: e.target.value})} className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500 font-bold transition-all text-sm"/></div></div>
                                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Password</label><div className="relative"><Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/><input type={showAdminPassword ? "text" : "password"} required value={superAdminData.password} onChange={e => setSuperAdminData({...superAdminData, password: e.target.value})} className="w-full pl-11 pr-11 py-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500 font-bold transition-all text-sm"/><button type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">{showAdminPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
                                <button type="submit" disabled={isSavingAccount} className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-sm shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3">
                                    {isSavingAccount ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} บันทึกข้อมูลบัญชี
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {activeTab === 'MIGRATION' && (
                    <div className="animate-fade-in max-w-4xl mx-auto space-y-6">
                        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
                            <div className="bg-blue-600 p-8 text-white">
                                <h2 className="text-2xl font-black mb-1 flex items-center gap-3"><Database size={28}/> ย้ายข้อมูลจาก Supabase</h2>
                                <p className="text-blue-50 text-xs opacity-90 font-bold">ดึงข้อมูลจากฐานข้อมูล Supabase เดิมมายัง MySQL บนโฮสติ้ง Lotus</p>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                    <div className="space-y-2">
                                        <label className="text-sm font-black text-slate-500 uppercase tracking-wider">Supabase API URL</label>
                                        <input 
                                            type="text" 
                                            placeholder="https://xyz.supabase.co" 
                                            value={migrationConfig.url}
                                            onChange={(e) => setMigrationConfig({...migrationConfig, url: e.target.value})}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all font-bold"
                                        />
                                        <p className="text-[10px] text-slate-400 font-bold italic">
                                            * ต้องเป็น API URL (ไม่ใช่ Dashboard URL) <br/>
                                            <span className="text-amber-600">⚠️ ห้ามใช้ URL ที่ขึ้นต้นด้วย supabase.com/dashboard</span>
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-black text-slate-500 uppercase tracking-wider">Service Role Key (secret)</label>
                                        <input 
                                            type="password" 
                                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
                                            value={migrationConfig.key}
                                            onChange={(e) => setMigrationConfig({...migrationConfig, key: e.target.value})}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none transition-all font-bold"
                                        />
                                        <p className="text-[10px] text-slate-400 font-bold italic">* ใช้ Service Role Key เพื่อสิทธิ์ในการเข้าถึงทุกตาราง</p>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row gap-4">
                                    <button 
                                        onClick={handleTestConnection}
                                        disabled={isMigrating || isExporting || isTestingConnection}
                                        className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isTestingConnection ? <Loader2 className="animate-spin" size={20}/> : <Check size={20}/>}
                                        {isTestingConnection ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
                                    </button>

                                    <button 
                                        onClick={handleDataMigration}
                                        disabled={isMigrating || isExporting || isTestingConnection}
                                        className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isMigrating ? <Loader2 className="animate-spin" size={20}/> : <ArrowRight size={20}/>}
                                        {isMigrating ? 'กำลังดำเนินการย้ายข้อมูล...' : 'เริ่มกระบวนการย้ายข้อมูล'}
                                    </button>

                                    <button 
                                        onClick={handleExportSQL}
                                        disabled={isMigrating || isExporting || isTestingConnection || isFixingSchema}
                                        className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black shadow-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isExporting ? <Loader2 className="animate-spin" size={20}/> : <Download size={20}/>}
                                        {isExporting ? 'กำลังเตรียมไฟล์ SQL...' : 'ดาวน์โหลดไฟล์ SQL'}
                                    </button>

                                    <button 
                                        onClick={handleFixSchema}
                                        disabled={isMigrating || isExporting || isTestingConnection || isFixingSchema}
                                        className="flex-1 py-4 bg-amber-600 text-white rounded-2xl font-black shadow-xl hover:bg-amber-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isFixingSchema ? <Loader2 className="animate-spin" size={20}/> : <Settings size={20}/>}
                                        {isFixingSchema ? 'กำลังแก้ไข...' : 'แก้ไขโครงสร้าง DB'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {Object.keys(migrationStatus).length > 0 && (
                            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-8">
                                <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                                    <Clock size={20} className="text-slate-400"/>
                                    สถานะการย้ายข้อมูลรายตาราง
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(migrationStatus).map(([table, status]) => (
                                        <div key={table} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{table}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{migrationProgress[table]}</span>
                                            </div>
                                            <div>
                                                {status === 'loading' && <Loader2 className="animate-spin text-blue-500" size={18}/>}
                                                {status === 'success' && <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center"><Check size={14}/></div>}
                                                {status === 'error' && <div className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center"><X size={14}/></div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {selectedSchoolId && (
                    <div className="animate-slide-up space-y-6">
                        <button onClick={() => setSelectedSchoolId(null)} className="flex items-center gap-2 text-slate-500 font-black hover:text-blue-600 transition-colors text-xs uppercase"><ArrowLeft size={16}/> กลับไปหน้าโรงเรียน</button>
                        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 bg-slate-50 border-b flex justify-between items-center"><h3 className="text-lg font-black text-slate-800 flex items-center gap-3"><Users className="text-blue-600"/> รายชื่อบุคลากร: {currentSchoolObj?.name}</h3></div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                        <tr><th className="p-6">บุคลากร</th><th className="p-6">ตำแหน่ง</th><th className="p-6 text-center">สถานภาพ</th><th className="p-6 text-right">สิทธิ์ผู้ดูแล</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {schoolStaff.length === 0 ? (<tr><td colSpan={4} className="p-20 text-center text-slate-400 font-bold italic">ไม่พบรายชื่อบุคลากร</td></tr>) : schoolStaff.map(t => (
                                            <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4 px-6"><div className="font-bold text-slate-700">{t.name}</div><div className="text-[10px] font-mono text-slate-400">ID: {t.id}</div></td>
                                                <td className="p-4 px-6 font-bold text-slate-500">{t.position}</td>
                                                <td className="p-4 px-6 text-center"><div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase ${t.isSuspended ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{t.isSuspended ? 'ระงับการใช้งาน' : 'ปกติ'}</div></td>
                                                <td className="p-4 px-6 text-right">
                                                    <button onClick={() => handleToggleTeacherAdmin(t)} className={`px-4 py-1.5 rounded-lg transition-all border-2 flex items-center gap-2 text-[10px] font-black uppercase ml-auto ${t.roles.includes('SYSTEM_ADMIN') ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-100 hover:bg-indigo-50'}`}>
                                                        {isUpdatingTeacher === t.id ? <Loader2 className="animate-spin" size={12}/> : (t.roles.includes('SYSTEM_ADMIN') ? <UserMinus size={12}/> : <ShieldPlus size={12}/>)}
                                                        {t.roles.includes('SYSTEM_ADMIN') ? 'ถอนสิทธิ์แอดมิน' : 'ตั้งเป็นแอดมิน'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 animate-scale-up">
                        <h3 className="text-xl font-black text-slate-800 mb-6 border-b pb-3">{isEditMode ? 'แก้ไขข้อมูลโรงเรียน' : 'เพิ่มโรงเรียนใหม่'}</h3>
                        <form onSubmit={handleSchoolSubmit} className="space-y-5">
                            <div><label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest ml-1">รหัสโรงเรียน 8 หลัก</label><input type="text" disabled={isEditMode} value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500 font-black text-xl disabled:opacity-50 text-center tracking-widest" required /></div>
                            <div><label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest ml-1">ชื่อโรงเรียน</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500 font-bold" required /></div>
                            <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-500 rounded-xl font-black text-xs uppercase">ยกเลิก</button><button type="submit" disabled={isSavingSchool} className="flex-2 py-2.5 bg-blue-600 text-white rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all active:scale-95 text-xs">{isSavingSchool ? <Loader2 className="animate-spin mx-auto" size={16}/> : 'บันทึกข้อมูล'}</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminDashboard;