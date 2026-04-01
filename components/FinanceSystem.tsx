import React, { useState, useEffect } from 'react';
import { Transaction, FinanceAccount, Teacher, SystemConfig } from '@/types';
import { TrendingUp, TrendingDown, DollarSign, Plus, Wallet, FileText, ArrowRight, PlusCircle, LayoutGrid, List, ArrowLeft, Loader, Database, ServerOff, Edit2, Trash2, X, Save, ShieldAlert, Eye, Printer, Upload, Calendar, Search, ChevronLeft, ChevronRight, HardDrive, Cloud, RefreshCw, AlertTriangle, HelpCircle, FileSpreadsheet, ChevronsLeft, ChevronsRight, ShoppingBag, Store } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, isConfigured as isSupabaseConfigured } from '@/supabaseClient';
import { sendTelegramMessage } from '@utils/telegram';

// Thai Date Helper
const getThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Convert YYYY-MM to Thai Month Year
const formatMonthYearInput = (ym: string) => {
    if (!ym) return '';
    const [year, month] = ym.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

interface FinanceSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
}

const FinanceSystem: React.FC<FinanceSystemProps> = ({ currentUser, allTeachers }) => {
    // State
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 15;

    // Permissions
    const isDirector = (currentUser.roles || []).includes('DIRECTOR');
    const isSystemAdmin = (currentUser.roles || []).includes('SYSTEM_ADMIN');
    const isBudgetOfficer = (currentUser.roles || []).includes('FINANCE_BUDGET');
    const isNonBudgetOfficer = (currentUser.roles || []).includes('FINANCE_NONBUDGET');
    const isCoopOfficer = (currentUser.roles || []).includes('FINANCE_COOP');

    // Default Tab Logic
    const getDefaultTab = () => {
        if (isBudgetOfficer) return 'Budget';
        if (isNonBudgetOfficer) return 'NonBudget';
        if (isCoopOfficer) return 'Coop';
        return 'Budget';
    };

    const [activeTab, setActiveTab] = useState<'Budget' | 'NonBudget' | 'Coop'>(getDefaultTab());
    
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'DETAIL' | 'PRINT' | 'TRANS_FORM'>('DASHBOARD');
    const [selectedAccount, setSelectedAccount] = useState<FinanceAccount | null>(null);

    const [reportConfig, setReportConfig] = useState<{
        type: 'ALL' | 'MONTH' | 'CUSTOM';
        month: string;
        customStart: string;
        customEnd: string;
    }>({
        type: 'MONTH',
        month: new Date().toISOString().slice(0, 7),
        customStart: new Date().toISOString().split('T')[0],
        customEnd: new Date().toISOString().split('T')[0]
    });

    const [showAccountForm, setShowAccountForm] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showEditAccountModal, setShowEditAccountModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
    const [newAccountName, setNewAccountName] = useState('');

    // Form Data
    const [newTrans, setNewTrans] = useState({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
    const [newAccountForm, setNewAccountForm] = useState({ name: '' });

    // --- Database Mappings ---
    const mapAccountFromDb = (a: any): FinanceAccount => ({
        id: a.id.toString(),
        schoolId: a.school_id,
        name: a.name,
        type: a.type as 'Budget' | 'NonBudget' | 'Coop',
        description: '' 
    });

    const mapTransactionFromDb = (t: any): Transaction => ({
        id: t.id.toString(),
        schoolId: t.school_id,
        accountId: t.account_id.toString(),
        date: t.date,
        description: t.description,
        amount: parseFloat(t.amount),
        type: t.type as 'Income' | 'Expense'
    });

    // --- DATA LOADING ---
    const fetchData = async () => {
        const client = supabase;
        setIsLoadingData(true);
        if (isSupabaseConfigured && client) {
            try {
                const { data: accData } = await client.from('finance_accounts').select('*').eq('school_id', currentUser.schoolId);
                if (accData) setAccounts(accData.map(mapAccountFromDb));

                const { data: transData } = await client.from('finance_transactions').select('*').eq('school_id', currentUser.schoolId);
                if (transData) setTransactions(transData.map(mapTransactionFromDb));

                const { data: configData } = await client.from('school_configs').select('*').eq('school_id', currentUser.schoolId).single();
                if (configData) setSysConfig({ driveFolderId: configData.drive_folder_id, scriptUrl: configData.script_url, telegramBotToken: configData.telegram_bot_token, appBaseUrl: configData.app_base_url, schoolName: configData.school_name });
            } catch (err) {
                console.error("Fetch Error", err);
            }
        }
        setIsLoadingData(false);
    };

    useEffect(() => { fetchData(); }, [currentUser.schoolId]);

    // --- AUTO-NAVIGATION LOGIC ---
    useEffect(() => {
        if (!isLoadingData && (activeTab === 'NonBudget' || activeTab === 'Coop') && viewMode === 'DASHBOARD') {
            const existingAccount = accounts.find(a => a.type === activeTab);
            if (existingAccount) {
                setSelectedAccount(existingAccount);
                setViewMode('DETAIL');
            }
        }
    }, [activeTab, accounts, viewMode, isLoadingData]);

    // --- DB OPERATIONS ---
    const handleSaveTransaction = async (t: Partial<Transaction>, isUpdate = false) => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return false;
        const payload: any = {
            school_id: currentUser.schoolId,
            account_id: t.accountId!.toString(),
            date: t.date,
            description: t.description,
            amount: parseFloat(t.amount as any),
            type: t.type
        };
        try {
            if (isUpdate && t.id) {
                const { error } = await client.from('finance_transactions').update(payload).eq('id', parseInt(t.id));
                if (error) throw error;
            } else {
                const { error } = await client.from('finance_transactions').insert([payload]);
                if (error) throw error;
            }
            return true;
        } catch (e: any) {
            console.error("Save Error:", e.message);
            return false;
        }
    };

    const handleSaveAccount = async (acc: Partial<FinanceAccount>) => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return false;
        const payload = { 
            id: `acc_${Date.now()}`,
            school_id: currentUser.schoolId, 
            name: acc.name, 
            type: acc.type 
        };
        const { error } = await client.from('finance_accounts').insert([payload]);
        if (error) { console.error(error); return false; }
        return true;
    };

    const handleUpdateAccountName = async (e: React.FormEvent) => {
        e.preventDefault();
        const client = supabase;
        if (!editingAccount || !newAccountName || !client) return;
        const { error } = await client.from('finance_accounts').update({ name: newAccountName }).eq('id', editingAccount.id);
        if (!error) { await fetchData(); setShowEditAccountModal(false); }
        else alert("แก้ไขล้มเหลว: " + error.message);
    };

    const handleDeleteAccount = async (accId: string) => {
        const client = supabase;
        if (!confirm("ยืนยันการลบบัญชีและประวัติทั้งหมด?") || !client) return;
        const { error } = await client.from('finance_accounts').delete().eq('id', accId);
        if (!error) await fetchData();
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await handleSaveAccount({ name: newAccountForm.name, type: activeTab });
        if (success) { 
            await fetchData(); 
            setNewAccountForm({ name: '' }); 
            setShowAccountForm(false); 
        }
        else alert("บันทึกไม่สำเร็จ");
    };

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        let targetAcc = selectedAccount;
        if (!targetAcc) {
            targetAcc = accounts.find(a => a.type === activeTab) || null;
        }
        if (!targetAcc) { alert("กรุณาเลือกบัญชี"); return; }

        const amountNum = parseFloat(newTrans.amount);
        const success = await handleSaveTransaction({
            accountId: targetAcc.id,
            date: newTrans.date,
            description: newTrans.desc,
            amount: amountNum,
            type: newTrans.type as any
        }, false);

        if (success) {
            // คำนวณยอดคงเหลือใหม่เพื่อแจ้งเตือน Telegram
            const currentAccTrans = transactions.filter(t => t.accountId === targetAcc!.id);
            const currentBalance = currentAccTrans.reduce((acc, t) => t.type === 'Income' ? acc + t.amount : acc - t.amount, 0);
            const updatedBalance = newTrans.type === 'Income' ? currentBalance + amountNum : currentBalance - amountNum;

            await fetchData();
            alert("บันทึกข้อมูลเรียบร้อย");
            setNewTrans({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
            setViewMode('DETAIL');
            
            if (sysConfig?.telegramBotToken) {
                const icon = newTrans.type === 'Income' ? '🟢 รายรับ (ฝาก)' : '🔴 รายจ่าย (ถอน)';
                const typeText = activeTab === 'Coop' ? 'เงินสหกรณ์' : activeTab === 'NonBudget' ? 'เงินนอกงบประมาณ' : 'เงินงบประมาณ';
                
                const msg = `${icon} <b>แจ้งเตือนบันทึกการเงิน (${typeText})</b>\n` +
                            `━━━━━━━━━━━━━━━━━━\n` +
                            `<b>บัญชี:</b> ${targetAcc.name}\n` +
                            `<b>รายการ:</b> ${newTrans.desc}\n` +
                            `<b>จำนวนเงิน:</b> ${amountNum.toLocaleString()} บาท\n` +
                            `━━━━━━━━━━━━━━━━━━\n` +
                            `💰 <b>คงเหลือสุทธิ: ${updatedBalance.toLocaleString()} บาท</b>\n` +
                            `━━━━━━━━━━━━━━━━━━\n` +
                            `👤 บันทึกโดย: ${currentUser.name}`;

                // คัดเลือกผู้รับ: ผู้อำนวยการ และ เจ้าหน้าที่ที่ดูแลประเภทบัญชีนั้นๆ
                const recipients = allTeachers.filter(t => 
                    t.schoolId === currentUser.schoolId && 
                    t.telegramChatId && 
                    (t.roles.includes('DIRECTOR') || 
                     (activeTab === 'Budget' && t.roles.includes('FINANCE_BUDGET')) ||
                     (activeTab === 'NonBudget' && t.roles.includes('FINANCE_NONBUDGET')) ||
                     (activeTab === 'Coop' && t.roles.includes('FINANCE_COOP')))
                );
                
                recipients.forEach(t => sendTelegramMessage(sysConfig.telegramBotToken!, t.telegramChatId!, msg));
            }
        } else {
            alert("บันทึกล้มเหลว");
        }
    };

    const handleUpdateTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTransaction) return;
        const success = await handleSaveTransaction(editingTransaction, true);
        if (success) { await fetchData(); setShowEditModal(false); setEditingTransaction(null); }
        else alert("บันทึกการแก้ไขไม่สำเร็จ");
    };

    const handleDeleteTransaction = async () => {
        const client = supabase;
        if (!editingTransaction || !client) return;
        const { error } = await client.from('finance_transactions').delete().eq('id', parseInt(editingTransaction.id));
        if (!error) { await fetchData(); setShowEditModal(false); }
    };

    // --- TAB & VIEW LOGIC ---
    useEffect(() => {
        if (activeTab === 'Budget') {
            setSelectedAccount(null);
            setViewMode('DASHBOARD');
        }
        setCurrentPage(1);
    }, [activeTab]);

    const canSeeBudget = isDirector || isSystemAdmin || isBudgetOfficer;
    const canSeeNonBudget = isDirector || isSystemAdmin || isNonBudgetOfficer;
    const canSeeCoop = isDirector || isSystemAdmin || isCoopOfficer;

    const canEdit = (activeTab === 'Budget' && (isBudgetOfficer || isDirector || isSystemAdmin)) || 
                  (activeTab === 'NonBudget' && (isNonBudgetOfficer || isDirector || isSystemAdmin)) ||
                  (activeTab === 'Coop' && (isCoopOfficer || isDirector || isSystemAdmin));

    const getAccountBalance = (accId: string) => {
        const accTrans = transactions.filter(t => t.accountId === accId);
        const income = accTrans.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
        const expense = accTrans.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
        return income - expense;
    };

    // --- RENDER FUNCTIONS ---
    const renderDashboard = () => (
        <div className="animate-fade-in space-y-6 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="text-orange-500"/> 
                        {activeTab === 'Coop' ? 'ระบบรายรับ-รายจ่ายสหกรณ์' : 'ระบบการเงินและงบประมาณ'}
                    </h2>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                        {isSupabaseConfigured ? <Cloud size={10} className="text-green-500"/> : <HardDrive size={10}/>}
                        {isSupabaseConfigured ? 'SQL Online Mode' : 'Local Mode'}
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner overflow-x-auto max-w-full">
                    {canSeeBudget && <button onClick={() => { setActiveTab('Budget'); setViewMode('DASHBOARD'); }} className={`px-4 py-2 rounded-md text-sm font-bold transition-all shrink-0 ${activeTab === 'Budget' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>เงินงบประมาณ</button>}
                    {canSeeNonBudget && <button onClick={() => { setActiveTab('NonBudget'); setViewMode('DASHBOARD'); }} className={`px-4 py-2 rounded-md text-sm font-bold transition-all shrink-0 ${activeTab === 'NonBudget' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>เงินนอกงบฯ</button>}
                    {canSeeCoop && <button onClick={() => { setActiveTab('Coop'); setViewMode('DASHBOARD'); }} className={`px-4 py-2 rounded-md text-sm font-bold transition-all shrink-0 ${activeTab === 'Coop' ? 'bg-white text-purple-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>สหกรณ์โรงเรียน</button>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {accounts.filter(a => a.type === activeTab).map((acc, index) => {
                    const balance = getAccountBalance(acc.id);
                    const gradients = activeTab === 'Coop' 
                        ? ['from-purple-500 to-indigo-600', 'from-fuchsia-500 to-purple-600', 'from-violet-500 to-indigo-700']
                        : activeTab === 'NonBudget' 
                            ? ['from-blue-500 to-cyan-600', 'from-cyan-500 to-blue-600', 'from-sky-500 to-indigo-600']
                            : ['from-amber-500 to-orange-600', 'from-orange-500 to-red-600', 'from-yellow-500 to-amber-600'];
                    const gradient = gradients[index % gradients.length];
                    return (
                        <div 
                            key={acc.id} 
                            onClick={() => { setSelectedAccount(acc); setViewMode('DETAIL'); }}
                            className={`relative rounded-[2.5rem] shadow-lg hover:shadow-2xl p-8 transition-all cursor-pointer group hover:-translate-y-2 bg-gradient-to-br ${gradient} text-white border-none overflow-hidden`}
                        >
                            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10 group-hover:opacity-20 transition-opacity">
                                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M0,50 Q25,0 50,50 T100,50" stroke="white" strokeWidth="2" fill="none" />
                                    <circle cx="80" cy="20" r="15" fill="white" />
                                </svg>
                            </div>
                            {canEdit && activeTab === 'Budget' && (
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-md rounded-full p-1 border border-white/20 z-20">
                                    <button onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); setNewAccountName(acc.name); setShowEditAccountModal(true); }} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"><Edit2 size={14}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }} className="p-2 text-white hover:bg-red-500 rounded-full transition-colors"><Trash2 size={14}/></button>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-8 relative z-10">
                                <div className="p-4 rounded-2xl bg-white/20 backdrop-blur-md shadow-xl border border-white/20 text-white">
                                    {activeTab === 'Coop' ? <ShoppingBag size={28}/> : <FileText size={28}/>}
                                </div>
                            </div>
                            <h3 className="font-black text-xl text-white line-clamp-2 min-h-[3.5rem] leading-tight drop-shadow-md relative z-10">{acc.name}</h3>
                            <div className="flex justify-between items-end border-t pt-4 mt-4 border-white/20 relative z-10">
                                <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">ยอดคงเหลือ</span>
                                <span className={`text-2xl font-black drop-shadow-md`}>฿{balance.toLocaleString()}</span>
                            </div>
                            <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0 z-10"><ArrowRight className="text-white"/></div>
                        </div>
                    );
                })}
                
                {canEdit && (activeTab === 'Budget' || accounts.filter(a => a.type === activeTab).length === 0) && (
                    <button onClick={() => setShowAccountForm(true)} className={`border-4 border-dashed border-slate-200 rounded-[2rem] p-8 flex flex-col items-center justify-center text-slate-300 transition-all gap-3 min-h-[250px] ${activeTab === 'Coop' ? 'hover:text-purple-500 hover:border-purple-200 hover:bg-purple-50' : activeTab === 'NonBudget' ? 'hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50' : 'hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50'}`}>
                        <PlusCircle size={48}/><span className="font-black text-lg">สร้างบัญชี {activeTab === 'Coop' ? 'สหกรณ์' : activeTab === 'NonBudget' ? 'เงินนอกงบประมาณ' : 'การเงิน'}</span>
                    </button>
                )}
            </div>
        </div>
    );

    const renderDetail = () => {
        let target = selectedAccount;
        if (!target) target = accounts.find(a => a.type === activeTab) || null;

        if (!target) return (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed text-slate-400 font-bold space-y-4">
                {activeTab === 'Coop' ? <Store className="mx-auto opacity-20" size={64}/> : <Wallet className="mx-auto opacity-20" size={64}/>}
                <p>ยังไม่พบข้อมูลบัญชี {activeTab === 'Coop' ? 'สหกรณ์' : activeTab === 'NonBudget' ? 'นอกงบฯ' : 'การเงิน'}</p>
                {canEdit && <button onClick={() => setShowAccountForm(true)} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg">สร้างบัญชี</button>}
            </div>
        );

        const filtered = transactions.filter(t => t.accountId === target!.id).sort((a, b) => b.date.localeCompare(a.date));
        const inc = filtered.filter(t => t.type === 'Income').reduce((s,t) => s + t.amount, 0);
        const exp = filtered.filter(t => t.type === 'Expense').reduce((s,t) => s + t.amount, 0);
        const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        const display = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        return (
            <div className="space-y-8 animate-slide-up pb-20 font-sarabun">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6 self-start md:self-auto">
                        <button onClick={() => { setViewMode('DASHBOARD'); setActiveTab('Budget'); }} className="p-3.5 bg-white hover:bg-slate-50 border rounded-2xl text-slate-400 shadow-sm transition-all group">
                            <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform"/>
                        </button>
                        <div className="space-y-0.5">
                            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight leading-none">{target.name}</h2>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                {activeTab === 'Budget' ? 'เงินงบประมาณ' : activeTab === 'NonBudget' ? 'เงินนอกงบประมาณ' : 'เงินสหกรณ์โรงเรียน'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4 w-full md:w-auto">
                        <button onClick={() => { setViewMode('PRINT'); setCurrentPage(1); }} className="flex-1 md:flex-none bg-slate-800 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black shadow-xl shadow-slate-200 transition-all active:scale-95">
                            <Printer size={22}/> พิมพ์รายงาน
                        </button>
                        {canEdit && (
                            <button onClick={() => setViewMode('TRANS_FORM')} className={`flex-[2] md:flex-none text-white px-10 py-4 rounded-2xl font-black shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 ${activeTab === 'Coop' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>
                                <Plus size={28}/> บันทึกรายการ
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary Cards Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:shadow-md">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">รายรับรวม</p>
                        <p className="text-2xl font-black text-green-600 leading-none">+{inc.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:shadow-md">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">รายจ่ายรวม</p>
                        <p className="text-2xl font-black text-red-600 leading-none">-{exp.toLocaleString()}</p>
                    </div>
                    <div className={`p-4 rounded-[2rem] shadow-2xl text-white transform hover:scale-[1.02] transition-all bg-[#2a2d61]`}>
                        <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-1 ml-1">คงเหลือสุทธิ</p>
                        <div className="flex items-baseline gap-1">
                             <span className="text-lg font-black text-slate-400">฿</span>
                             <span className="text-3xl font-black">{(inc-exp).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Transaction Table Section */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                    <div className="p-6 bg-slate-50/50 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                             รายการเดินบัญชี
                             <span className="text-xs font-bold text-slate-400 bg-white px-3 py-1 rounded-full border ml-2">หน้า {currentPage} / {pages || 1}</span>
                        </h3>
                        <div className="relative group w-full sm:w-auto">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18}/>
                            <input type="text" placeholder="ค้นหารายการ..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 ring-blue-100 text-sm font-bold transition-all"/>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b text-slate-400 font-black uppercase text-[11px] tracking-widest">
                                <tr>
                                    <th className="p-3 px-6">วันที่</th>
                                    <th className="p-3 px-6">รายการ</th>
                                    <th className="p-3 px-6 text-right">จำนวนเงิน</th>
                                    {canEdit && <th className="p-3 px-6 text-center w-24">จัดการ</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {display.map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="p-2 px-6 font-black text-slate-500 whitespace-nowrap">{getThaiDate(t.date)}</td>
                                        <td className="p-2 px-6 font-bold text-slate-800 text-md leading-tight">{t.description}</td>
                                        <td className={`p-2 px-6 text-right font-black text-xl ${t.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                                            {t.type === 'Income' ? '+' : '-'}{t.amount.toLocaleString()}
                                        </td>
                                        {canEdit && (
                                            <td className="p-2 px-6 text-center">
                                                <button onClick={() => { setEditingTransaction(t); setShowEditModal(true); }} className="text-slate-300 hover:text-blue-600 p-2 hover:bg-white rounded-2xl shadow-sm opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110">
                                                    <Edit2 size={16}/>
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {display.length === 0 && (
                                    <tr>
                                        <td colSpan={canEdit ? 4 : 3} className="p-12 text-center text-slate-300 font-black italic uppercase tracking-[0.3em] opacity-40">
                                            NO TRANSACTIONS FOUND
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {pages > 1 && (
                        <div className="p-6 bg-slate-50/50 flex justify-center items-center gap-2 border-t">
                            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-2xl bg-white border shadow-sm disabled:opacity-30 hover:shadow-md transition-all text-slate-500 active:scale-95"><ChevronsLeft size={18}/></button>
                            <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="p-2 rounded-2xl bg-white border shadow-sm disabled:opacity-30 hover:shadow-md transition-all text-slate-500 active:scale-95"><ChevronLeft size={18}/></button>
                            <span className="font-black text-slate-600 uppercase text-[10px] tracking-widest mx-4 bg-white px-4 py-1.5 rounded-full border shadow-inner">หน้า {currentPage} จาก {pages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(pages, p+1))} disabled={currentPage === pages} className="p-2 rounded-2xl bg-white border shadow-sm disabled:opacity-30 hover:shadow-md transition-all text-slate-500 active:scale-95"><ChevronRight size={18}/></button>
                            <button onClick={() => setCurrentPage(pages)} disabled={currentPage === pages} className="p-2 rounded-2xl bg-white border shadow-sm disabled:opacity-30 hover:shadow-md transition-all text-slate-500 active:scale-95"><ChevronsRight size={18}/></button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderPrintView = () => {
        let target = selectedAccount || accounts.find(a => a.type === activeTab);
        if (!target) return null;
        
        const officerRoleMap: any = { 'Budget': 'FINANCE_BUDGET', 'NonBudget': 'FINANCE_NONBUDGET', 'Coop': 'FINANCE_COOP' };
        const officerRole = officerRoleMap[activeTab];
        const officer = allTeachers.find(t => t.roles.includes(officerRole));
        const director = allTeachers.find(t => t.roles.includes('DIRECTOR'));

        let startDateStr = "";
        let endDateStr = "9999-12-31";

        if (reportConfig.type === 'MONTH') {
            startDateStr = `${reportConfig.month}-01`;
            endDateStr = `${reportConfig.month}-31`;
        } else if (reportConfig.type === 'CUSTOM') {
            startDateStr = reportConfig.customStart;
            endDateStr = reportConfig.customEnd;
        }

        const allPrevTrans = transactions
            .filter(t => t.accountId === target!.id)
            .filter(t => startDateStr !== "" && t.date < startDateStr);
        
        const prevIncome = allPrevTrans.filter(t => t.type === 'Income').reduce((s,t) => s + t.amount, 0);
        const prevExpense = allPrevTrans.filter(t => t.type === 'Expense').reduce((s,t) => s + t.amount, 0);
        const carriedBalance = prevIncome - prevExpense;

        const filtered = transactions
            .filter(t => t.accountId === target!.id)
            .filter(t => {
                if (reportConfig.type === 'ALL') return true;
                return t.date >= startDateStr && t.date <= endDateStr;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
        
        const totalInc = filtered.filter(t => t.type === 'Income').reduce((s,t) => s + t.amount, 0);
        const totalExp = filtered.filter(t => t.type === 'Expense').reduce((s,t) => s + t.amount, 0);

        return (
            <div className="bg-slate-100 min-h-screen animate-fade-in pb-20 print:bg-white">
                <style>{`
                    @media print {
                        @page { size: A4 portrait; margin: 20mm 10mm 20mm 10mm; }
                        body { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; }
                        .no-print { display: none !important; }
                        table { width: 100% !important; border-collapse: collapse !important; border: 2px solid black !important; }
                        td, th { border: 1px solid black !important; }
                    }
                `}</style>

                <div className="bg-white p-4 shadow-sm mb-6 print:hidden sticky top-0 z-40 border-b border-slate-200">
                    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-6">
                         <div className="flex items-center gap-4 w-full lg:w-auto flex-wrap justify-center">
                             <button onClick={() => { setViewMode('DETAIL'); setCurrentPage(1); }} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold bg-slate-100 p-2.5 px-4 rounded-xl transition-all">
                                <ArrowLeft size={18}/> ย้อนกลับ
                             </button>
                             <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                                <button onClick={() => setReportConfig({ ...reportConfig, type: 'MONTH' })} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${reportConfig.type === 'MONTH' ? 'bg-white shadow text-blue-600 border' : 'text-slate-500'}`}>รายเดือน</button>
                                <button onClick={() => setReportConfig({ ...reportConfig, type: 'CUSTOM' })} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${reportConfig.type === 'CUSTOM' ? 'bg-white shadow text-blue-600 border' : 'text-slate-500'}`}>กำหนดเอง</button>
                             </div>
                             {reportConfig.type === 'MONTH' && (
                                <input type="month" value={reportConfig.month} onChange={(e) => setReportConfig({ ...reportConfig, month: e.target.value })} className="border rounded-xl px-4 py-2 text-sm font-black focus:ring-2 ring-blue-200 outline-none"/>
                             )}
                         </div>
                         <button onClick={() => window.print()} className="w-full lg:w-auto bg-blue-600 text-white px-10 py-3 rounded-2xl hover:bg-blue-700 font-black flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all"><Printer size={20}/> สั่งพิมพ์รายงาน</button>
                    </div>
                </div>

                <div className="bg-white shadow-2xl mx-auto print:shadow-none print:w-full print:m-0 text-slate-900 font-sarabun min-h-[297mm] p-[20mm] md:w-[210mm]">
                    <div className="text-center mb-10">
                        <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">รายงานสรุปการรับ - จ่ายเงิน {activeTab === 'Coop' ? '(สหกรณ์)' : ''}</h2>
                        <h3 className="text-xl font-bold text-slate-800">{target.name}</h3>
                        <p className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-widest border-b-2 pb-4 w-fit mx-auto border-slate-900">
                            {reportConfig.type === 'MONTH' && `ประจำเดือน ${formatMonthYearInput(reportConfig.month)}`}
                            {reportConfig.type === 'CUSTOM' && `ตั้งแต่วันที่ ${getThaiDate(reportConfig.customStart)} ถึง ${getThaiDate(reportConfig.customEnd)}`}
                        </p>
                    </div>

                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-100 font-black uppercase text-[11px]">
                            <tr>
                                <th className="border border-black p-3 text-center w-[50px]">ที่</th>
                                <th className="border border-black p-3 text-center w-[120px]">วัน/เดือน/ปี</th>
                                <th className="border border-black p-3 text-left">รายการ</th>
                                <th className="border border-black p-3 text-right w-[100px]">รายรับ</th>
                                <th className="border border-black p-3 text-right w-[100px]">รายจ่าย</th>
                                <th className="border border-black p-3 text-right w-[110px]">คงเหลือ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportConfig.type !== 'ALL' && startDateStr !== "" && (
                                <tr className="font-bold bg-slate-50">
                                    <td className="border border-black p-3 text-center">-</td>
                                    <td className="border border-black p-3 text-center italic">{getThaiDate(startDateStr)}</td>
                                    <td className="border border-black p-3 uppercase tracking-wider">ยอดยกมา (Carried Forward)</td>
                                    <td className="border border-black p-3 text-right">-</td>
                                    <td className="border border-black p-3 text-right">-</td>
                                    <td className="border border-black p-3 text-right font-black">{carriedBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                </tr>
                            )}
                            {filtered.map((t, idx) => {
                                const rb = carriedBalance + filtered.slice(0, idx+1).reduce((s, i) => i.type === 'Income' ? s + i.amount : s - i.amount, 0);
                                return (
                                    <tr key={t.id} className="font-medium">
                                        <td className="border border-black p-3 text-center font-mono">{idx + 1}</td>
                                        <td className="border border-black p-3 text-center whitespace-nowrap">{getThaiDate(t.date)}</td>
                                        <td className="border border-black p-3">{t.description}</td>
                                        <td className="border border-black p-3 text-right text-green-800 font-bold">{t.type === 'Income' ? t.amount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</td>
                                        <td className="border border-black p-3 text-right text-red-800 font-bold">{t.type === 'Expense' ? t.amount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</td>
                                        <td className="border border-black p-3 text-right font-black">{rb.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-100 font-black border-t-2 border-black">
                            <tr className="text-md">
                                <td colSpan={3} className="border border-black p-4 text-center uppercase tracking-[0.2em]">รวมทั้งสิ้น</td>
                                <td className="border border-black p-4 text-right text-green-800">{totalInc.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td className="border border-black p-4 text-right text-red-800">{totalExp.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td className={`border border-black p-4 text-right bg-slate-200`}>{(carriedBalance + totalInc - totalExp).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    if (isLoadingData) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader className="animate-spin text-orange-500" size={48}/><p className="font-black text-slate-400 uppercase tracking-[0.2em] text-[10px]">Synchronizing Financial Data...</p></div>;

    return (
        <div className="max-w-6xl mx-auto">
            {viewMode === 'DASHBOARD' && renderDashboard()}
            {viewMode === 'DETAIL' && renderDetail()}
            {viewMode === 'PRINT' && renderPrintView()}
            
            {viewMode === 'TRANS_FORM' && (
                <div className="max-w-2xl mx-auto animate-slide-up space-y-8 pb-20">
                    <button onClick={() => setViewMode('DETAIL')} className="flex items-center gap-2 font-black text-slate-400 hover:text-slate-800 uppercase tracking-widest text-xs transition-colors group"><ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform"/> กลับสู่หน้าบัญชี</button>
                    <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 relative overflow-hidden">
                        <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-full -z-0 ${activeTab === 'Coop' ? 'bg-purple-50' : activeTab === 'NonBudget' ? 'bg-blue-50' : 'bg-orange-50'}`}></div>
                        <h3 className="text-3xl font-black text-slate-800 mb-10 flex items-center gap-4 relative z-10">
                            {activeTab === 'Coop' ? <ShoppingBag className="text-purple-600" size={36}/> : <PlusCircle className="text-orange-500" size={36}/>} 
                            บันทึกรายการ {activeTab === 'Coop' ? 'สหกรณ์' : activeTab === 'NonBudget' ? 'เงินนอกงบประมาณ' : 'การเงิน'}
                        </h3>
                        <form onSubmit={handleAddTransaction} className="space-y-8 relative z-10">
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border">
                                <button type="button" onClick={() => setNewTrans({...newTrans, type: 'Income'})} className={`flex-1 py-4 rounded-xl font-black text-lg transition-all ${newTrans.type === 'Income' ? 'bg-white text-green-600 shadow-md border border-slate-200' : 'text-slate-400'}`}>รายรับ (ฝาก)</button>
                                <button type="button" onClick={() => setNewTrans({...newTrans, type: 'Expense'})} className={`flex-1 py-4 rounded-xl font-black text-lg transition-all ${newTrans.type === 'Expense' ? 'bg-white text-red-600 shadow-md border border-slate-200' : 'text-slate-400'}`}>รายจ่าย (ถอน)</button>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-[0.2em] ml-2">วันที่รายการ</label><input type="date" required value={newTrans.date} onChange={e => setNewTrans({...newTrans, date: e.target.value})} className="w-full px-6 py-4 border-2 border-slate-50 rounded-[1.5rem] font-bold outline-none focus:border-blue-500 bg-slate-50 transition-all"/></div>
                                <div><label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-[0.2em] ml-2">จำนวนเงิน (บาท)</label><input type="number" step="0.01" required value={newTrans.amount} onChange={e => setNewTrans({...newTrans, amount: e.target.value})} className={`w-full px-6 py-4 border-2 border-slate-50 rounded-[1.5rem] font-black text-3xl outline-none bg-slate-50 transition-all ${activeTab === 'Coop' ? 'focus:border-purple-500 text-purple-600' : activeTab === 'NonBudget' ? 'focus:border-blue-500 text-blue-600' : 'focus:border-orange-500 text-orange-600'}`} placeholder="0.00"/></div>
                            </div>
                            <div><label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-[0.2em] ml-2">รายละเอียดรายการ</label><textarea required rows={4} value={newTrans.desc} onChange={e => setNewTrans({...newTrans, desc: e.target.value})} className={`w-full px-6 py-4 border-2 border-slate-50 rounded-[1.5rem] font-bold outline-none bg-slate-50 leading-relaxed transition-all ${activeTab === 'Coop' ? 'focus:border-purple-500' : activeTab === 'NonBudget' ? 'focus:border-blue-500' : 'focus:border-orange-500'}`} placeholder="ระบุชื่อรายการ/ใบเสร็จ/ความจำเป็น..."/></div>
                            <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-4 active:scale-95 group uppercase tracking-widest"><Save size={28}/> ยืนยันบันทึกข้อมูล SQL</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Account Form Modal */}
            {showAccountForm && (
                <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className={`bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 animate-scale-up border-4 ${activeTab === 'Coop' ? 'border-purple-500/10' : activeTab === 'NonBudget' ? 'border-blue-500/10' : 'border-orange-500/10'}`}>
                        <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-3">
                            {activeTab === 'Coop' ? <ShoppingBag className="text-purple-600"/> : <PlusCircle className="text-blue-600"/>} 
                            สร้างบัญชี {activeTab === 'Budget' ? 'งบประมาณ' : activeTab === 'NonBudget' ? 'นอกงบฯ' : 'สหกรณ์'} ใหม่
                        </h3>
                        <form onSubmit={handleAddAccount} className="space-y-6">
                            <input autoFocus required placeholder="ระบุชื่อบัญชี..." value={newAccountForm.name} onChange={e => setNewAccountForm({name: e.target.value})} className={`w-full border-2 border-slate-100 p-5 rounded-2xl font-black text-lg outline-none shadow-inner bg-slate-50 transition-all ${activeTab === 'Coop' ? 'focus:border-purple-500' : activeTab === 'NonBudget' ? 'focus:border-blue-500' : 'focus:border-blue-500'}`}/>
                            <div className="flex gap-4 pt-2"><button type="button" onClick={() => setShowAccountForm(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-slate-500 uppercase tracking-widest text-xs transition-colors">ยกเลิก</button><button type="submit" className={`flex-2 py-4 text-white rounded-2xl font-black shadow-xl text-lg active:scale-95 transition-all ${activeTab === 'Coop' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}>สร้างบัญชี</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Transaction Modal */}
            {showEditModal && editingTransaction && (
                <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 animate-scale-up border-4 border-blue-600/10">
                        <div className="flex justify-between items-center mb-8"><h3 className="font-black text-2xl text-slate-800 flex items-center gap-3"><Edit2 className="text-blue-500"/> แก้ไขรายการ</h3><button onClick={() => { if(confirm("ยืนยันการลบรายการนี้?")) handleDeleteTransaction(); }} className="text-red-500 hover:bg-red-50 p-3 rounded-full transition-colors"><Trash2 size={24}/></button></div>
                        <form onSubmit={handleUpdateTransaction} className="space-y-6">
                             <div className="flex bg-slate-100 p-1 rounded-2xl border shadow-inner">
                                <button type="button" onClick={() => setEditingTransaction({...editingTransaction, type: 'Income'})} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editingTransaction.type === 'Income' ? 'bg-white text-green-600 shadow border' : 'text-slate-400'}`}>รายรับ</button>
                                <button type="button" onClick={() => setEditingTransaction({...editingTransaction, type: 'Expense'})} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editingTransaction.type === 'Expense' ? 'bg-white text-red-600 shadow border' : 'text-slate-400'}`}>รายจ่าย</button>
                             </div>
                            <input type="date" value={editingTransaction.date} onChange={e => setEditingTransaction({...editingTransaction, date: e.target.value})} className="w-full border-2 border-slate-100 p-4 rounded-xl font-bold bg-slate-50"/>
                            <input type="text" value={editingTransaction.description} onChange={e => setEditingTransaction({...editingTransaction, description: e.target.value})} className="w-full border-2 border-slate-100 p-4 rounded-xl font-bold bg-slate-50"/>
                            <input type="number" step="0.01" value={editingTransaction.amount} onChange={e => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})} className={`w-full border-2 border-slate-100 p-4 rounded-xl font-black text-2xl bg-slate-50 ${activeTab === 'Coop' ? 'text-purple-600' : 'text-blue-600'}`}/>
                            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-slate-500 uppercase tracking-widest text-xs">ยกเลิก</button><button type="submit" className={`flex-2 py-4 text-white rounded-2xl font-black shadow-xl text-lg active:scale-95 transition-all ${activeTab === 'Coop' ? 'bg-purple-600' : 'bg-blue-600'}`}>บันทึกแก้ไข</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Account Modal */}
            {showEditAccountModal && (
                <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 animate-scale-up border-4 border-blue-600/10">
                        <h3 className="text-2xl font-black mb-8 text-slate-800">แก้ไขชื่อบัญชี</h3>
                        <form onSubmit={handleUpdateAccountName} className="space-y-6">
                            <input autoFocus required value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className="w-full border-2 border-slate-100 p-5 rounded-2xl font-black text-lg outline-none focus:border-blue-500 shadow-inner bg-slate-50"/>
                            <div className="flex gap-4 pt-2"><button type="button" onClick={() => setShowEditAccountModal(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-slate-500 uppercase tracking-widest text-xs transition-colors">ยกเลิก</button><button type="submit" className={`flex-2 py-4 text-white rounded-2xl font-black shadow-xl text-lg active:scale-95 transition-all ${activeTab === 'Coop' ? 'bg-purple-600' : 'bg-blue-600'}`}>บันทึก</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceSystem;