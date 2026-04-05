
import React, { useState } from 'react';
import { School, Teacher } from '@/types';
import { Lock, User, Building, LogIn, UserPlus, ShieldAlert, Eye, EyeOff, Search, CheckCircle, ArrowRight, ArrowLeft, AlertTriangle, GraduationCap, Loader } from 'lucide-react';
import { supabase, isConfigured as isSupabaseConfigured } from '@/supabaseClient';

interface LoginScreenProps {
    schools: School[];
    teachers: Teacher[];
    onLogin: (user: Teacher) => void;
    onRegister: (schoolId: string, id: string, name: string) => void;
    onSuperAdminLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ schools, teachers, onLogin, onRegister, onSuperAdminLogin }) => {
    console.log("LoginScreen: Rendering...", { schoolsCount: schools.length, teachersCount: teachers.length });
    const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'SUPER_ADMIN'>('LOGIN');
    
    // Login State
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    
    // Register State
    const [regStep, setRegStep] = useState<1 | 2>(1);
    const [regSchoolId, setRegSchoolId] = useState('');
    const [foundSchool, setFoundSchool] = useState<School | null>(null);
    const [regUsername, setRegUsername] = useState('');
    const [regFullName, setRegFullName] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsAuthenticating(true);

        try {
            // 1. Check for Super Admin from Database (Async)
            const client = supabase;
            if (isSupabaseConfigured && client) {
                const { data: superAdmin, error: superError } = await client
                    .from('admin_accounts')
                    .select('*')
                    .eq('username', loginUsername)
                    .eq('password', loginPassword)
                    .maybeSingle();

                if (superAdmin && !superError) {
                    onSuperAdminLogin();
                    return;
                }
                
                if (superError) {
                    console.error("Super Admin Auth Error:", superError);
                    setError(`ข้อผิดพลาดฐานข้อมูล: ${superError.message || 'ไม่สามารถเชื่อมต่อได้'}`);
                    setIsAuthenticating(false);
                    return;
                }
                
                // Fallback for legacy local development if needed
                if (loginUsername === 'admin' && loginPassword === 'schoolos') {
                     onSuperAdminLogin();
                     return;
                }
            } else {
                // If Supabase not configured, use hardcoded (Dev mode)
                if (loginUsername === 'admin' && loginPassword === 'schoolos') {
                    onSuperAdminLogin();
                    return;
                }
            }

            // 2. Regular Teacher Login (Local logic based on allTeachers state)
            const user = teachers.find(t => t.id === loginUsername);
            
            if (!user) {
                setError('ไม่พบข้อมูลผู้ใช้งาน (ตรวจสอบเลขบัตรประชาชน)');
                setIsAuthenticating(false);
                return;
            }

            // 3. Check for Suspension and Approval
            const school = schools.find(s => s.id === user.schoolId);
            if (school?.isSuspended) {
                setError('ขออภัย โรงเรียนของท่านถูกระงับการเข้าใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบกลาง');
                setIsAuthenticating(false);
                return;
            }

            if (user.isSuspended) {
                setError('บัญชีผู้ใช้ของท่านถูกระงับการใช้งาน กรุณาติดต่อผู้บริหารโรงเรียน');
                setIsAuthenticating(false);
                return;
            }

            if (user.isApproved === false) {
                setError('บัญชีของท่านอยู่ระหว่างรอการอนุมัติจากผู้บริหารโรงเรียน กรุณารอรับการยืนยัน');
                setIsAuthenticating(false);
                return;
            }

            if (user.password !== loginPassword) {
                setError('รหัสผ่านไม่ถูกต้อง');
                setIsAuthenticating(false);
                return;
            }

            onLogin(user);
        } catch (err) {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleCheckSchool = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (regSchoolId.length !== 8) {
            setError('กรุณากรอกรหัสโรงเรียนให้ครบ 8 หลัก');
            return;
        }

        const school = schools.find(s => s.id === regSchoolId);
        if (school) {
            if (school.isSuspended) {
                setError('ขออภัย โรงเรียนนี้ถูกระงับการใช้งาน ไม่สามารถลงทะเบียนเพิ่มได้');
                return;
            }
            setFoundSchool(school);
            setRegStep(2);
        } else {
            setError('ไม่พบรหัสโรงเรียนนี้ในระบบ');
        }
    };

    const handleFinalRegister = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (regUsername.length !== 13) {
            setError('เลขบัตรประชาชนต้องมี 13 หลัก');
            return;
        }

        const existingUser = teachers.find(t => t.id === regUsername);
        if (existingUser) {
            setError('เลขบัตรประชาชนนี้เคยลงทะเบียนไว้แล้ว');
            return;
        }

        if (foundSchool) {
            onRegister(foundSchool.id, regUsername, regFullName);
            alert('ลงทะเบียนสำเร็จ! กรุณารอผู้ดูแลระบบของโรงเรียนอนุมัติการเข้าใช้งาน เข้าสู่ระบบด้วยรหัสเริ่มต้น: 123456');
            setMode('LOGIN');
            setLoginUsername(regUsername);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sarabun overflow-y-auto">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden my-auto border-t-8 border-blue-600">
                <div className="bg-slate-900 p-10 text-center text-white relative">
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20 transform rotate-3">
                        <GraduationCap size={48} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-black tracking-tight mb-2">SchoolOS</h1>
                    <p className="text-blue-400 text-xs font-black uppercase tracking-[0.2em] mb-4">Smart Management Platform</p>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <p className="text-sm italic font-medium text-slate-300 leading-relaxed">
                            "บริหารจัดการด้วยใจ มุ่งมั่นพัฒนาการศึกษาไทยสู่สากล"
                        </p>
                    </div>
                </div>

                <div className="flex border-b bg-slate-50">
                    <button 
                        onClick={() => { setMode('LOGIN'); setError(''); }}
                        className={`flex-1 py-5 text-sm font-black transition-all ${mode === 'LOGIN' ? 'text-blue-600 border-b-4 border-blue-600 bg-white' : 'text-slate-400 hover:bg-slate-100'}`}
                    >
                        เข้าสู่ระบบ
                    </button>
                    <button 
                        onClick={() => { setMode('REGISTER'); setError(''); setRegStep(1); }}
                        className={`flex-1 py-5 text-sm font-black transition-all ${mode === 'REGISTER' ? 'text-blue-600 border-b-4 border-blue-600 bg-white' : 'text-slate-400 hover:bg-slate-100'}`}
                    >
                        ลงทะเบียนใหม่
                    </button>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="mb-6 bg-red-50 border-2 border-red-100 text-red-600 text-sm p-4 rounded-2xl flex items-start gap-3 animate-shake shadow-sm">
                            <AlertTriangle size={20} className="shrink-0"/>
                            <span className="font-bold">{error}</span>
                        </div>
                    )}

                    {mode === 'LOGIN' && (
                        <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
                            <div>
                                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">เลขบัตรประชาชน / ชื่อผู้ใช้</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20}/>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="Citizen ID"
                                        value={loginUsername}
                                        onChange={(e) => setLoginUsername(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">รหัสผ่าน</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20}/>
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        required
                                        placeholder="Password"
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold transition-all"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                                    >
                                        {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                                    </button>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isAuthenticating}
                                className="w-full py-5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 font-black text-base shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {isAuthenticating ? <Loader className="animate-spin" size={22}/> : <LogIn size={22}/>} เข้าใช้งานระบบ
                            </button>
                            
                            <p className="text-center text-xs text-slate-400 font-bold mt-4">
                                ระบบบริหารจัดการสถานศึกษาครบวงจร v5.0
                            </p>
                        </form>
                    )}

                    {mode === 'REGISTER' && regStep === 1 && (
                        <form onSubmit={handleCheckSchool} className="space-y-6 animate-fade-in">
                            <div className="text-center">
                                <h3 className="font-black text-slate-800 text-xl mb-1">ยืนยันรหัสโรงเรียน</h3>
                                <p className="text-sm text-slate-400 font-bold">ระบุรหัส 8 หลัก เพื่อเริ่มต้นการลงทะเบียน</p>
                            </div>
                            <input 
                                type="text" 
                                required
                                maxLength={8}
                                placeholder="00000000"
                                value={regSchoolId}
                                onChange={(e) => setRegSchoolId(e.target.value)}
                                className="w-full px-4 py-5 bg-slate-50 border-2 border-blue-100 rounded-2xl focus:border-blue-500 outline-none text-center text-4xl font-black tracking-widest text-blue-600 shadow-inner"
                            />
                            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 flex items-center justify-center gap-3 transition-all active:scale-95">
                                ตรวจสอบรหัสโรงเรียน <ArrowRight size={22}/>
                            </button>
                        </form>
                    )}

                    {mode === 'REGISTER' && regStep === 2 && foundSchool && (
                        <form onSubmit={handleFinalRegister} className="space-y-4 animate-fade-in">
                            <div className="bg-emerald-50 p-5 rounded-[1.5rem] text-center border-2 border-emerald-100 mb-4">
                                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mb-1">ข้อมูลโรงเรียนที่พบ</p>
                                <p className="font-black text-slate-800 text-lg">{foundSchool.name}</p>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">เลขบัตรประชาชน (13 หลัก)</label>
                                <input 
                                    type="text" required maxLength={13}
                                    value={regUsername}
                                    onChange={(e) => setRegUsername(e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                                    placeholder="0-0000-00000-00-0"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">ชื่อ - นามสกุล (ภาษาไทย)</label>
                                <input 
                                    type="text" required
                                    value={regFullName}
                                    onChange={(e) => setRegFullName(e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                                    placeholder="กรอกชื่อและนามสกุล"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setRegStep(1)} className="p-5 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-colors"><ArrowLeft size={22}/></button>
                                <button type="submit" className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95">ยืนยันลงทะเบียน</button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
            <style>{`.animate-shake { animation: shake 0.3s ease-in-out; } @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }`}</style>
        </div>
    );
};

export default LoginScreen;
