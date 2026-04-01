
import React, { useState } from 'react';
import { Teacher } from '@/types';
import { Lock, Save, AlertTriangle, UserCog } from 'lucide-react';
import { ACADEMIC_POSITIONS } from '@/constants';

interface FirstLoginSetupProps {
    user: Teacher;
    onComplete: (newPassword: string, position: string) => void;
    onLogout: () => void;
}

const FirstLoginSetup: React.FC<FirstLoginSetupProps> = ({ user, onComplete, onLogout }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [position, setPosition] = useState(ACADEMIC_POSITIONS[1]); // Default 'ครู'
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 6) {
            setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('รหัสผ่านยืนยันไม่ตรงกัน');
            return;
        }

        if (newPassword === '123456') {
            setError('กรุณาตั้งรหัสผ่านใหม่ ที่ไม่ใช่รหัสเริ่มต้น');
            return;
        }

        onComplete(newPassword, position);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sarabun overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-down my-auto">
                <div className="bg-orange-600 p-6 text-white text-center">
                    <UserCog size={48} className="mx-auto mb-2 opacity-80"/>
                    <h2 className="text-xl font-bold">ตั้งค่าเริ่มต้นใช้งาน</h2>
                    <p className="text-orange-100 text-sm">ยินดีต้อนรับคุณ {user.name}</p>
                </div>

                <div className="p-6">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 flex gap-3 text-sm text-yellow-800">
                        <AlertTriangle className="shrink-0 mt-0.5" size={18}/>
                        <p>เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านและระบุตำแหน่งปัจจุบันของท่านก่อนเริ่มใช้งาน</p>
                    </div>

                    {error && (
                        <div className="mb-4 text-red-600 text-sm font-bold text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">ตำแหน่งทางวิชาการ</label>
                            <select 
                                value={position} 
                                onChange={(e) => setPosition(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                            >
                                {ACADEMIC_POSITIONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">รหัสผ่านใหม่</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                <input 
                                    type="password" 
                                    required
                                    placeholder="รหัสผ่านใหม่"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">ยืนยันรหัสผ่านใหม่</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                <input 
                                    type="password" 
                                    required
                                    placeholder="ยืนยันรหัสผ่านใหม่"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            className="w-full py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-bold shadow-md flex items-center justify-center gap-2 mt-4"
                        >
                            <Save size={20}/> บันทึกและเริ่มใช้งาน
                        </button>
                    </form>

                    <button 
                        onClick={onLogout}
                        className="w-full text-center text-slate-400 text-sm mt-4 hover:text-slate-600 underline"
                    >
                        ยกเลิก / ออกจากระบบ
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FirstLoginSetup;
