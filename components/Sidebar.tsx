
import React from 'react';
import { SystemView, Teacher } from '@/types';
import { Home, FileText, UserMinus, DollarSign, MapPin, LogOut, X, CalendarRange, Settings, UserCircle, GraduationCap, Calendar } from 'lucide-react';

const APP_LOGO_URL = "https://img2.pic.in.th/pic/9c2e0f8ba684e3441fc58d880fdf143d.png";

interface SidebarProps {
    currentView: SystemView;
    onChangeView: (view: SystemView) => void;
    isMobileOpen: boolean;
    toggleMobile: () => void;
    currentUser: Teacher;
    allTeachers: Teacher[];
    onSwitchUser: (teacherId: string) => void;
    schoolLogo?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isMobileOpen, toggleMobile, currentUser, allTeachers, onSwitchUser, schoolLogo }) => {
    
    const menuItems = [
        { id: SystemView.DASHBOARD, label: 'ภาพรวม', icon: Home, visible: true },
        { id: SystemView.DOCUMENTS, label: 'งานสารบรรณ', icon: FileText, visible: true },
        { id: SystemView.LEAVE, label: 'ระบบการลา', icon: UserMinus, visible: true },
        { id: SystemView.DIRECTOR_CALENDAR, label: 'ปฏิทินปฏิบัติงาน ผอ.', icon: Calendar, visible: (currentUser.roles || []).includes('SYSTEM_ADMIN') || (currentUser.roles || []).includes('DIRECTOR') || (currentUser.roles || []).includes('DOCUMENT_OFFICER') || currentUser.isActingDirector || (currentUser.roles || []).includes('TEACHER') },
        { id: SystemView.ACADEMIC, label: 'งานวิชาการ', icon: GraduationCap, visible: true }, 
        { id: SystemView.FINANCE, label: 'ระบบการเงิน', icon: DollarSign, visible: true },
        { id: SystemView.PLAN, label: 'แผนปฏิบัติการ', icon: CalendarRange, visible: true },
        { id: SystemView.ATTENDANCE, label: 'ลงเวลาทำงาน', icon: MapPin, visible: true },
        { id: SystemView.ADMIN_USERS, label: 'ผู้ดูแลระบบ', icon: Settings, visible: (currentUser.roles || []).includes('SYSTEM_ADMIN') || (currentUser.roles || []).includes('DIRECTOR') },
    ];

    const baseClasses = "fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0";
    const mobileClasses = isMobileOpen ? "translate-x-0" : "-translate-x-full";

    return (
        <>
             {isMobileOpen && (
                <div 
                    className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
                    onClick={toggleMobile}
                ></div>
            )}

            <div className={`${baseClasses} ${mobileClasses} flex flex-col shadow-xl`}>
                <div className="h-16 flex items-center justify-between px-6 bg-slate-800 shrink-0">
                    <div className="flex items-center space-x-3">
                        <img src={schoolLogo || APP_LOGO_URL} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white shadow-sm" />
                        <span className="text-xl font-bold tracking-tight">SchoolOS</span>
                    </div>
                    <button onClick={toggleMobile} className="lg:hidden">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-6">
                    <nav className="space-y-1 px-3">
                        {menuItems.filter(i => i.visible).map((item) => {
                            const Icon = item.icon;
                            const isActive = currentView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        onChangeView(item.id);
                                        toggleMobile();
                                    }}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                                        isActive 
                                            ? 'bg-blue-600 text-white shadow-md font-medium translate-x-1' 
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon size={20} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-white'} />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="p-4 bg-slate-800/50 border-t border-slate-800">
                    <div className="flex items-center gap-3 mb-4 px-2 cursor-pointer hover:bg-slate-700/50 p-2 rounded-lg transition-colors" onClick={() => onChangeView(SystemView.PROFILE)}>
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                             <UserCircle size={32}/>
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate text-white">{currentUser.name}</p>
                            <p className="text-xs text-slate-400 truncate">{currentUser.position}</p>
                        </div>
                    </div>

                    <div className="mb-2 px-2">
                         <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Developer Mode: Switch User</label>
                         <select 
                            value={currentUser.id} 
                            onChange={(e) => onSwitchUser(e.target.value)}
                            className="w-full bg-slate-900 text-slate-400 text-xs rounded p-1 outline-none border border-slate-700"
                        >
                            {allTeachers.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;