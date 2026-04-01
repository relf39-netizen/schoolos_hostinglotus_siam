import React, { useState, useEffect, useMemo } from 'react';
import { Teacher, DirectorEvent, SystemConfig } from '@/types';
import { MOCK_DIRECTOR_EVENTS } from '@/constants';
import { 
    Calendar as CalendarIcon, Clock, MapPin, Plus, Trash2, Bell, 
    ServerOff, ListFilter, History, CheckCircle, ChevronLeft, 
    ChevronRight, Circle, X, CalendarDays, Layout, AlertCircle, RefreshCw, Loader
} from 'lucide-react';
import { supabase, isConfigured as isSupabaseConfigured } from '@/supabaseClient';
import { sendTelegramMessage } from '@utils/telegram';

interface DirectorCalendarProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
}

const DirectorCalendar: React.FC<DirectorCalendarProps> = ({ currentUser, allTeachers }) => {
    // Helper to format Date object to "YYYY-MM-DD" in local time
    const formatDateLocal = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const [events, setEvents] = useState<DirectorEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    const [activeTab, setActiveTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
    const [viewMode, setViewMode] = useState<'CALENDAR' | 'LIST'>('CALENDAR');
    const [showForm, setShowForm] = useState(false);
    
    const [selectedDay, setSelectedDay] = useState<string>(formatDateLocal(new Date()));
    const [newEvent, setNewEvent] = useState<Partial<DirectorEvent>>({ 
        date: formatDateLocal(new Date()), 
        startTime: '09:00', 
        title: '', 
        location: '', 
        description: '' 
    });

    const [currentDate, setCurrentDate] = useState(new Date());

    const isDocOfficer = (currentUser.roles || []).includes('DOCUMENT_OFFICER');
    const isDirector = (currentUser.roles || []).includes('DIRECTOR') || currentUser.isActingDirector;
    const isAdmin = (currentUser.roles || []).includes('SYSTEM_ADMIN');
    const canEdit = isDocOfficer || isDirector || isAdmin;

    // Helper to parse "YYYY-MM-DD" string correctly in local time
    const parseDateLocal = (dateStr: string) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const getThaiFullDate = (dateStr: string) => { 
        if (!dateStr) return ''; 
        const d = parseDateLocal(dateStr);
        const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']; 
        const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]; 
        return `วัน${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`; 
    };

    const getThaiMonthYear = (date: Date) => {
        const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        return `${months[date.getMonth()]} ${date.getFullYear() + 543}`;
    };

    const getThaiMonthShort = (dateStr: string) => { 
        const d = parseDateLocal(dateStr);
        const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]; 
        return months[d.getMonth()]; 
    };

    // --- Data Fetching ---
    useEffect(() => {
        const loadConfigs = async () => {
            if (isSupabaseConfigured && supabase) {
                try {
                    const { data } = await supabase.from('school_configs').select('*').eq('school_id', currentUser.schoolId).maybeSingle();
                    if (data) {
                        setSysConfig({
                            driveFolderId: data.drive_folder_id || '',
                            scriptUrl: data.script_url || '',
                            telegramBotToken: data.telegram_bot_token || '',
                            appBaseUrl: data.app_base_url || '',
                            schoolName: data.school_name || ''
                        } as SystemConfig);
                    } else {
                        // Reset config if not found for current school to prevent leaking state
                        setSysConfig(null);
                    }
                } catch (e) {
                    console.error("Error loading school config from Supabase:", e);
                    setSysConfig(null);
                }
            }
        };
        const loadEvents = async () => {
            if (isSupabaseConfigured && supabase) {
                setIsLoading(true);
                try {
                    const { data } = await supabase.from('director_events').select('*').eq('school_id', currentUser.schoolId);
                    if (data) {
                        setEvents(data.map((e: any) => ({
                            id: e.id,
                            title: e.title,
                            date: e.date,
                            startTime: e.start_time,
                            endTime: e.end_time,
                            location: e.location,
                            description: e.description,
                            notifiedOneDayBefore: e.notified_one_day_before,
                            notifiedOnDay: e.notified_on_day
                        })));
                    }
                } catch (e) {
                    console.error("Error loading director events:", e);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setEvents(MOCK_DIRECTOR_EVENTS);
                setIsLoading(false);
            }
        };

        loadConfigs();
        loadEvents();
    }, [currentUser.schoolId]);

    // --- Auto-Notification Trigger Logic ---
    useEffect(() => {
        if (!isLoading && events.length > 0 && canEdit && sysConfig?.telegramBotToken) {
            const checkAndNotify = async () => {
                const todayStr = formatDateLocal(new Date());
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = formatDateLocal(tomorrow);

                for (const event of events) {
                    let type: 'TODAY' | 'TOMORROW' | null = null;
                    let updateField = "";

                    // Check for Today
                    if (event.date === todayStr && !event.notifiedOnDay) {
                        type = 'TODAY';
                        updateField = "notifiedOnDay";
                    } 
                    // Check for Tomorrow
                    else if (event.date === tomorrowStr && !event.notifiedOneDayBefore) {
                        type = 'TOMORROW';
                        updateField = "notifiedOneDayBefore";
                    }

                    if (type && updateField) {
                        console.log(`Auto-notifying mission: ${event.title} (${type})`);
                        await notifyDirector(event, type);
                        // Update DB to prevent repeated notifications
                        if (isSupabaseConfigured && supabase) {
                            try {
                                await supabase.from('director_events').update({
                                    [updateField === 'notifiedOnDay' ? 'notified_on_day' : 'notified_one_day_before']: true
                                }).eq('id', event.id);
                            } catch (e) {
                                console.error("Failed to update notification flag", e);
                            }
                        }
                    }
                }
            };
            checkAndNotify();
        }
    }, [events, isLoading, canEdit, sysConfig?.telegramBotToken]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    
    const upcomingEvents = useMemo(() => 
        events.filter(e => parseDateLocal(e.date).getTime() >= today.getTime())
              .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [events, today]);

    const pastEvents = useMemo(() => 
        events.filter(e => parseDateLocal(e.date).getTime() < today.getTime())
              .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
    [events, today]);

    const displayedEvents = activeTab === 'UPCOMING' ? upcomingEvents : pastEvents;

    const hasMissionToday = useMemo(() => {
        const todayStr = formatDateLocal(new Date());
        return events.some(e => e.date === todayStr);
    }, [events]);

    const dayEventsForSelected = useMemo(() => 
        events.filter(e => e.date === selectedDay)
              .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, selectedDay]);

    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        
        return days;
    }, [currentDate]);

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEvent.title || !newEvent.date || !newEvent.startTime) return;
        const eventData: any = { 
            title: newEvent.title,
            date: newEvent.date,
            start_time: newEvent.startTime,
            location: newEvent.location,
            description: newEvent.description,
            school_id: currentUser.schoolId, 
            created_by: currentUser.id, 
            notified_one_day_before: false, 
            notified_on_day: false 
        };
        try {
            if (isSupabaseConfigured && supabase) { 
                const { data, error } = await supabase.from('director_events').insert(eventData).select().single(); 
                if (error) throw error;
                if (data) {
                    const mappedEvent = {
                        id: data.id,
                        title: data.title,
                        date: data.date,
                        startTime: data.start_time,
                        location: data.location,
                        description: data.description,
                        notifiedOneDayBefore: data.notified_one_day_before,
                        notifiedOnDay: data.notified_on_day
                    };
                    setEvents([...events, mappedEvent as DirectorEvent]);
                    notifyDirector(mappedEvent, 'NEW'); 
                }
            } else { 
                setEvents([...events, { ...newEvent, id: `evt_${Date.now()}` } as DirectorEvent]); 
            }
            setShowForm(false); 
            setNewEvent({ date: formatDateLocal(new Date()), startTime: '09:00', title: '', location: '', description: '' });
        } catch (e) { alert('ล้มเหลว'); }
    };

    const handleDeleteEvent = async (id: string) => { 
        if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการปฏิทินนี้?")) { 
            if (isSupabaseConfigured && supabase) {
                await supabase.from('director_events').delete().eq('id', id);
                setEvents(events.filter(e => e.id !== id));
            } else {
                setEvents(events.filter(e => e.id !== id)); 
            }
        } 
    };

    const notifyDirector = async (event: any, type: 'NEW' | 'TOMORROW' | 'TODAY') => {
        if (!sysConfig?.telegramBotToken) return;
        const directors = allTeachers.filter(t => ((t.roles || []).includes('DIRECTOR') || t.isActingDirector) && t.schoolId === currentUser.schoolId);
        if (directors.length === 0) return;
        let title = ""; let icon = "";
        switch (type) { 
            case 'NEW': title = "เพิ่มนัดหมายใหม่"; icon = "🆕"; break; 
            case 'TOMORROW': title = "⏰ ภารกิจวันพรุ่งนี้"; icon = "🔔"; break; 
            case 'TODAY': title = "⚡️ ภารกิจวันนี้"; icon = "📢"; break; 
        }
        const message = `<b>${title}</b>\n--------------------------\n<b>เรื่อง:</b> ${event.title}\n<b>วันที่:</b> ${getThaiFullDate(event.date)}\n<b>เวลา:</b> ${event.startTime} น.\n<b>สถานที่:</b> ${event.location || '-'}\n--------------------------\n${type === 'TODAY' ? '💡 อย่าลืมเตรียมความพร้อมสำหรับการปฏิบัติหน้าที่ในวันนี้นะครับ' : '(บันทึกข้อมูลโดย: ' + currentUser.name + ')'}`;
        
        const deepLink = `${sysConfig.appBaseUrl || window.location.origin}?view=DIRECTOR_CALENDAR`;
        
        directors.forEach(d => {
            if (d.telegramChatId) {
                sendTelegramMessage(sysConfig.telegramBotToken!, d.telegramChatId, message, deepLink);
            }
        });
    };

    return (
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fade-in pb-20 font-sarabun">
            {/* Main Header */}
            <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 md:p-4 bg-purple-600 text-white rounded-2xl md:rounded-3xl shadow-lg shadow-purple-200">
                        <CalendarIcon size={28} className="md:w-8 md:h-8"/>
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl md:text-2xl font-black text-slate-800 leading-tight">ปฏิทินปฏิบัติงาน ผอ.</h2>
                            {hasMissionToday && (
                                <span className="bg-red-50 text-red-600 px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-1 border border-red-100">
                                    <AlertCircle size={10} className="md:w-3 md:h-3"/> มีภารกิจวันนี้
                                </span>
                            )}
                        </div>
                        <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest">{sysConfig?.schoolName || 'Management System'}</p>
                    </div>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl md:rounded-2xl border shadow-inner">
                    <button onClick={() => setViewMode('CALENDAR')} className={`px-4 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:sm font-black transition-all flex items-center gap-2 ${viewMode === 'CALENDAR' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}>
                        <Layout size={16}/> ปฏิทิน
                    </button>
                    <button onClick={() => setViewMode('LIST')} className={`px-4 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:sm font-black transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}>
                        <ListFilter size={16}/> รายการ
                    </button>
                </div>

                {canEdit && (
                    <button onClick={() => setShowForm(true)} className="bg-purple-600 text-white px-5 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl hover:bg-purple-700 font-black flex items-center gap-2 shadow-xl shadow-purple-200 active:scale-95 transition-all text-sm md:text-base">
                        <Plus size={18}/> เพิ่มนัดหมาย
                    </button>
                )}
            </div>

            {viewMode === 'CALENDAR' ? (
                <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start">
                    {/* Small Calendar Grid (Left Side) */}
                    <div className="w-full lg:w-[350px] bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden shrink-0">
                        <div className="p-4 md:p-6 flex justify-between items-center bg-slate-50 border-b">
                            <h3 className="text-base md:text-lg font-black text-slate-800">{getThaiMonthYear(currentDate)}</h3>
                            <div className="flex gap-1">
                                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><ChevronLeft size={16}/></button>
                                <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 hover:bg-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 transition-colors">วันนี้</button>
                                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><ChevronRight size={16}/></button>
                            </div>
                        </div>

                        <div className="grid grid-cols-7 bg-slate-50 border-b">
                            {['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((day, i) => (
                                <div key={day} className={`py-2 md:py-3 text-center text-[9px] md:text-[10px] font-black uppercase tracking-widest ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 p-2 md:p-3 gap-1">
                            {calendarDays.map((day, idx) => {
                                if (!day) return <div key={`empty-${idx}`} className="h-10 w-10 md:h-12 md:w-12"></div>;
                                
                                const dateStr = formatDateLocal(day);
                                const dayEvents = events.filter(e => e.date === dateStr);
                                const isToday = day.toDateString() === new Date().toDateString();
                                const isSelected = dateStr === selectedDay;
                                const isPastDate = day.getTime() < today.getTime();

                                return (
                                    <div 
                                        key={dateStr} 
                                        onClick={() => setSelectedDay(dateStr)}
                                        className={`h-10 w-10 md:h-12 md:w-12 flex flex-col items-center justify-center relative cursor-pointer rounded-xl md:rounded-2xl transition-all group ${isSelected ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 ring-2 ring-purple-100' : (isToday ? 'bg-purple-50 text-purple-700' : 'hover:bg-slate-50 text-slate-600')}`}
                                    >
                                        <span className={`text-xs md:text-sm font-black ${isSelected ? 'text-white' : (isToday ? 'text-purple-600' : (day.getDay() === 0 ? 'text-red-400' : (day.getDay() === 6 ? 'text-blue-400' : '')))}`}>
                                            {day.getDate()}
                                        </span>

                                        {dayEvents.length > 0 && (
                                            <div className="mt-0.5 flex justify-center">
                                                <Circle className={`${isSelected ? 'text-white fill-white' : 'text-purple-600 fill-purple-600'}`} size={4} />
                                            </div>
                                        )}

                                        {isPastDate && dayEvents.length > 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                                                <X className={`${isSelected ? 'text-white' : 'text-slate-400'}`} size={24} strokeWidth={3}/>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Event Details (Right Side) */}
                    <div className="flex-1 w-full space-y-4 md:space-y-6">
                        <div className="bg-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 min-h-[350px]">
                            <h3 className="text-lg md:text-xl font-black text-slate-800 mb-6 md:mb-8 flex items-center gap-3">
                                <CalendarDays className="text-purple-600 md:w-7 md:h-7" size={24}/>
                                ภารกิจ {getThaiFullDate(selectedDay)}
                            </h3>

                            <div className="space-y-4">
                                {dayEventsForSelected.length === 0 ? (
                                    <div className="text-center py-16 md:py-20 bg-slate-50/50 rounded-[1.5rem] md:rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                                        <CalendarIcon size={40} className="text-slate-200 md:w-12 md:h-12"/>
                                        <p className="text-slate-400 font-bold italic text-sm md:text-base">ไม่พบนัดหมายในวันที่เลือก</p>
                                    </div>
                                ) : (
                                    dayEventsForSelected.map(event => {
                                        const isPast = parseDateLocal(event.date).getTime() < today.getTime();
                                        const isToday = event.date === formatDateLocal(new Date());
                                        return (
                                            <div key={event.id} className={`p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 transition-all hover:shadow-md relative overflow-hidden ${isPast ? 'bg-slate-50 border-slate-200' : 'bg-white border-purple-100 hover:border-purple-200'}`}>
                                                {isPast && (
                                                    <div className="absolute top-0 right-0 p-3 z-10">
                                                        <X className="text-slate-300 md:w-10 md:h-10" size={32} strokeWidth={1}/>
                                                    </div>
                                                )}
                                                {isToday && (
                                                    <div className="absolute top-3 right-3 md:top-4 md:right-4 bg-red-500 text-white text-[8px] md:text-[9px] font-black uppercase px-2 md:px-3 py-1 rounded-full animate-pulse flex items-center gap-1 shadow-lg shadow-red-200">
                                                        <Bell size={8} className="md:w-2.5 md:h-2.5"/> ภารกิจวันนี้
                                                    </div>
                                                )}
                                                <div className="flex flex-col md:flex-row gap-4 md:gap-6 relative z-10">
                                                    <div className={`flex flex-col items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl shrink-0 ${isPast ? 'bg-slate-200 text-slate-400' : 'bg-purple-100 text-purple-700'}`}>
                                                        <Clock size={16} className="mb-1 md:w-5 md:h-5"/>
                                                        <span className="text-xs md:text-sm font-black">{event.startTime} น.</span>
                                                    </div>
                                                    <div className="flex-1 space-y-1 md:space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            {!isPast && <Circle className="text-purple-600 fill-purple-600 md:w-2.5 md:h-2.5" size={8} />}
                                                            <h3 className={`text-lg md:text-xl font-black ${isPast ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{event.title}</h3>
                                                        </div>
                                                        <div className="flex flex-wrap gap-3 md:gap-4 text-[10px] md:text-xs font-bold text-slate-400">
                                                            {event.location && (<div className="flex items-center gap-1.5"><MapPin size={14} className="text-red-400 md:w-4 md:h-4"/> {event.location}</div>)}
                                                        </div>
                                                        {event.description && <p className="text-xs md:text-sm text-slate-500 font-medium italic mt-1 md:mt-2">"{event.description}"</p>}
                                                    </div>
                                                    <div className="flex items-end justify-end">
                                                        {canEdit && <button onClick={() => handleDeleteEvent(event.id)} className="p-2 md:p-3 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl md:rounded-2xl transition-all active:scale-95"><Trash2 size={18} className="md:w-5 md:h-5"/></button>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4 md:space-y-6">
                    <div className="flex bg-slate-100 p-1 rounded-xl md:rounded-2xl border w-fit shadow-inner">
                        <button onClick={() => setActiveTab('UPCOMING')} className={`px-4 md:px-6 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-black flex items-center gap-2 transition-all ${activeTab === 'UPCOMING' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}>
                            <CalendarDays size={16} className="md:w-4.5 md:h-4.5"/> นัดหมายเร็วๆ นี้ ({upcomingEvents.length})
                        </button>
                        <button onClick={() => setActiveTab('PAST')} className={`px-4 md:px-6 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-black flex items-center gap-2 transition-all ${activeTab === 'PAST' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>
                            <History size={16} className="md:w-4.5 md:h-4.5"/> ภารกิจที่ผ่านมา ({pastEvents.length})
                        </button>
                    </div>

                    <div className="space-y-3 md:space-y-4">
                        {displayedEvents.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-[1.5rem] md:rounded-[2rem] border-2 border-dashed text-slate-300 font-bold italic text-sm md:text-base">ไม่พบข้อมูลนัดหมาย</div>
                        ) : (
                            displayedEvents.map(event => {
                                const todayStr = formatDateLocal(new Date());
                                const isToday = event.date === todayStr;
                                const isPast = parseDateLocal(event.date).getTime() < today.getTime();
                                return (
                                    <div key={event.id} className={`bg-white rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-6 shadow-sm border transition-all hover:shadow-md relative overflow-hidden ${isToday ? 'border-purple-500 ring-2 ring-purple-100' : 'border-slate-200'} ${isPast ? 'opacity-70' : ''}`}>
                                        {isPast && (
                                            <div className="absolute top-0 right-0 p-3 md:p-4 z-10">
                                                <X className="text-slate-300 md:w-12 md:h-12" size={36} strokeWidth={1}/>
                                            </div>
                                        )}
                                        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                                            <div className={`flex flex-col items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-3xl shrink-0 transition-transform hover:scale-105 ${isToday ? 'bg-purple-600 text-white shadow-xl shadow-purple-200' : (isPast ? 'bg-slate-100 text-slate-400' : 'bg-purple-50 text-purple-700')}`}>
                                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">{getThaiMonthShort(event.date)}</span>
                                                <span className="text-2xl md:text-3xl font-black">{parseDateLocal(event.date).getDate()}</span>
                                            </div>
                                            <div className="flex-1 space-y-1 md:space-y-2">
                                                <div className="flex items-center gap-2">
                                                    {isToday && <span className="bg-red-500 text-white text-[8px] md:text-[9px] px-2 md:px-3 py-1 rounded-full font-black uppercase tracking-widest animate-pulse shadow-lg shadow-red-200">วันนี้</span>}
                                                    {!isPast && <Circle className="text-purple-600 fill-purple-600 md:w-2.5 md:h-2.5" size={8} />}
                                                    <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">{event.title}</h3>
                                                </div>
                                                <p className="text-xs md:text-sm font-bold text-slate-500">{getThaiFullDate(event.date)}</p>
                                                <div className="flex flex-wrap gap-3 md:gap-4 text-[10px] md:text-xs font-bold text-slate-400 mt-1 md:mt-2">
                                                    <div className="flex items-center gap-1.5"><Clock size={14} className="text-purple-400 md:w-4 md:h-4"/> {event.startTime} น.</div>
                                                    {event.location && (<div className="flex items-center gap-1.5"><MapPin size={14} className="text-red-400 md:w-4 md:h-4"/> {event.location}</div>)}
                                                </div>
                                                {event.description && <p className="text-xs md:text-sm text-slate-600 font-medium bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl mt-3 md:mt-4 border border-slate-100 italic">"{event.description}"</p>}
                                            </div>
                                            <div className="flex items-end justify-end">
                                                {canEdit && <button onClick={() => handleDeleteEvent(event.id)} className="p-2 md:p-3 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl md:rounded-2xl transition-all active:scale-95"><Trash2 size={20} className="md:w-5.5 md:h-5.5"/></button>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Event Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-lg p-6 md:p-10 animate-scale-up border-4 border-purple-500/10">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-3"><Plus className="text-purple-600 md:w-7 md:h-7" size={24}/> เพิ่มภารกิจ ผอ.</h3>
                            <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={20} className="md:w-6 md:h-6"/></button>
                        </div>
                        <form onSubmit={handleSaveEvent} className="space-y-4 md:space-y-6">
                            <div>
                                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 ml-1 md:ml-2">หัวข้อนัดหมาย</label>
                                <input type="text" required placeholder="ระบุชื่อนัดหมาย หรือภารกิจ..." className="w-full px-4 py-3 md:px-6 md:py-4 border-2 border-slate-50 rounded-xl md:rounded-2xl font-bold outline-none focus:border-purple-500 bg-slate-50 transition-all text-sm md:text-base" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})}/>
                            </div>
                            <div className="grid grid-cols-2 gap-4 md:gap-6">
                                <div>
                                    <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 ml-1 md:ml-2">วันที่</label>
                                    <input type="date" required className="w-full px-4 py-3 md:px-6 md:py-4 border-2 border-slate-50 rounded-xl md:rounded-2xl font-bold outline-none focus:border-purple-500 bg-slate-50 transition-all text-sm md:text-base" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 ml-1 md:ml-2">เวลา (รูปแบบ 24 ชม.)</label>
                                    <input type="time" required className="w-full px-4 py-3 md:px-6 md:py-4 border-2 border-slate-50 rounded-xl md:rounded-2xl font-bold outline-none focus:border-purple-500 bg-slate-50 transition-all text-sm md:text-base" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 ml-1 md:ml-2">สถานที่</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 md:w-4.5 md:h-4.5" size={16} />
                                    <input type="text" placeholder="ระบุสถานที่ประชุม/จัดงาน..." className="w-full pl-10 pr-4 md:pl-12 md:pr-6 py-3 md:py-4 border-2 border-slate-50 rounded-xl md:rounded-2xl font-bold outline-none focus:border-purple-500 bg-slate-50 transition-all text-sm md:text-base" value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})}/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 ml-1 md:ml-2">รายละเอียดเพิ่มเติม (เลือกใส่)</label>
                                <textarea rows={2} placeholder="ระบุรายละเอียดเพิ่มเติมของภารกิจ..." className="w-full px-4 py-3 md:px-6 md:py-4 border-2 border-slate-50 rounded-xl md:rounded-2xl font-bold outline-none focus:border-purple-500 bg-slate-50 transition-all leading-relaxed text-sm md:text-base" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})}/>
                            </div>
                            <div className="flex gap-3 md:gap-4 pt-2 md:pt-4">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 md:py-5 bg-slate-100 text-slate-600 rounded-xl md:rounded-2xl font-black hover:bg-slate-200 uppercase tracking-widest text-[10px] md:text-xs transition-all">ยกเลิก</button>
                                <button type="submit" className="flex-[2] py-3 md:py-5 bg-purple-600 text-white rounded-xl md:rounded-2xl font-black text-base md:text-lg shadow-xl shadow-purple-200 hover:bg-purple-700 active:scale-95 transition-all">บันทึกภารกิจ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DirectorCalendar;
