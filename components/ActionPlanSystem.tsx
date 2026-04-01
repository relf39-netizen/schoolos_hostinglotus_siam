import React, { useState, useEffect, useMemo } from 'react';
import { PlanDepartment, Project, Teacher, ProjectStatus, SystemConfig, School } from '@/types';
import { 
    Briefcase, CheckCircle, Clock, Plus, ArrowLeft, Trash2, Loader, 
    Wallet, BookOpen, Settings, X, Save, CalendarRange, ChevronDown, 
    CheckSquare, Coins, Edit3, AlertCircle, TrendingUp, PieChart, 
    FileText, UserPlus, ToggleLeft, ToggleRight, CalendarPlus,
    Users, Zap, Layers, Download, Printer, FileSpreadsheet, RefreshCw,
    ArrowRight
} from 'lucide-react';
import { supabase, isConfigured } from '@/supabaseClient';
import { generateActionPlanPdf } from '@utils/pdfStamper';
import * as XLSX from 'xlsx';

interface ActionPlanSystemProps {
    currentUser: Teacher;
    currentSchool: School;
}

const ActionPlanSystem: React.FC<ActionPlanSystemProps> = ({ currentUser, currentSchool }) => {
    const [departments, setDepartments] = useState<PlanDepartment[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [selectedDept, setSelectedDept] = useState<PlanDepartment | null>(null);
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'DETAIL'>('OVERVIEW');
    const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>((new Date().getFullYear() + 543).toString());
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [showAddYearModal, setShowAddYearModal] = useState(false);
    const [newYearInput, setNewYearInput] = useState('');

    const [totalSubsidyBudget, setTotalSubsidyBudget] = useState(0); 
    const [totalLearnerDevBudget, setTotalLearnerDevBudget] = useState(0); 
    const [allowTeacherProposal, setAllowTeacherProposal] = useState(false);

    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [showEditProjectModal, setShowEditProjectModal] = useState(false);
    const [showSettlementModal, setShowSettlementModal] = useState(false);
    
    const [tempBudgetConfig, setTempBudgetConfig] = useState({ subsidy: 0, learner: 0, allowProposal: false });
    const [editingProject, setEditingProject] = useState<{deptId: string, project: Project} | null>(null);
    const [settleProjectData, setSettleProjectData] = useState<{deptId: string, project: Project} | null>(null);
    const [actualAmountInput, setActualAmountInput] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectAmount, setNewProjectAmount] = useState('');
    const [budgetSource, setBudgetSource] = useState<'Subsidy' | 'LearnerDev'>('Subsidy');
    
    const [isSaving, setIsSaving] = useState(false);

    const isDirector = (currentUser.roles || []).includes('DIRECTOR');
    const isPlanOfficer = (currentUser.roles || []).includes('PLAN_OFFICER');
    const isAdmin = isDirector || isPlanOfficer;

    const STANDARD_DEPTS = ['กลุ่มบริหารงานวิชาการ', 'กลุ่มบริหารงานงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารงานทั่วไป', 'งบกลาง / สาธารณูปโภค'];

    const getDeptStyle = (name: string) => {
        switch(name) {
            case 'กลุ่มบริหารงานวิชาการ': return { icon: BookOpen, colorClass: 'text-blue-600', bgClass: 'bg-blue-50', hoverBg: 'group-hover:bg-blue-600', borderHover: 'hover:border-blue-200', ghostText: 'text-blue-500' };
            case 'กลุ่มบริหารงานงบประมาณ': return { icon: Coins, colorClass: 'text-orange-600', bgClass: 'bg-orange-50', hoverBg: 'group-hover:bg-orange-600', borderHover: 'hover:border-orange-200', ghostText: 'text-orange-500' };
            case 'กลุ่มบริหารงานบุคคล': return { icon: Users, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50', hoverBg: 'group-hover:bg-emerald-600', borderHover: 'hover:border-emerald-200', ghostText: 'text-emerald-500' };
            case 'กลุ่มบริหารงานทั่วไป': return { icon: Settings, colorClass: 'text-slate-600', bgClass: 'bg-slate-50', hoverBg: 'group-hover:bg-slate-800', borderHover: 'hover:border-slate-300', ghostText: 'text-slate-400' };
            case 'งบกลาง / สาธารณูปโภค': return { icon: Zap, colorClass: 'text-rose-600', bgClass: 'bg-rose-50', hoverBg: 'group-hover:bg-rose-600', borderHover: 'hover:border-rose-200', ghostText: 'text-rose-500' };
            default: return { icon: Briefcase, colorClass: 'text-indigo-600', bgClass: 'bg-slate-50', hoverBg: 'group-hover:bg-indigo-600', borderHover: 'hover:border-indigo-200', ghostText: 'text-indigo-500' };
        }
    };

    const activeDept = useMemo(() => departments.find(d => d.id === selectedDept?.id) || null, [departments, selectedDept?.id]);

    const loadData = async () => {
        setIsLoadingData(true);
        if (isConfigured && supabase) {
            try {
                const { data: configData } = await supabase.from('school_configs').select('*').eq('school_id', currentUser.schoolId).maybeSingle();
                if (configData) setSysConfig(configData as any);

                const { data: projs } = await supabase.from('plan_projects').select('*').eq('school_id', currentUser.schoolId).eq('fiscal_year', selectedFiscalYear);
                const { data: budget } = await supabase.from('budget_settings').select('*').eq('id', `budget_${currentUser.schoolId}_${selectedFiscalYear}`).maybeSingle();
                
                const { data: allProjectYears } = await supabase.from('plan_projects').select('fiscal_year').eq('school_id', currentUser.schoolId);
                const { data: allBudgetYears } = await supabase.from('budget_settings').select('fiscal_year').eq('school_id', currentUser.schoolId);

                const yearSet = new Set<string>();
                yearSet.add((new Date().getFullYear() + 543).toString());
                allProjectYears?.forEach((p: any) => p.fiscal_year && yearSet.add(p.fiscal_year));
                allBudgetYears?.forEach((b: any) => b.fiscal_year && yearSet.add(b.fiscal_year));
                setAvailableYears(Array.from(yearSet).sort((a: string, b: string) => parseInt(b) - parseInt(a)));

                if (budget) { 
                    setTotalSubsidyBudget(Number(budget.subsidy) || 0); 
                    setTotalLearnerDevBudget(Number(budget.learner) || 0); 
                    setAllowTeacherProposal(budget.allow_teacher_proposal || false);
                } else { 
                    setTotalSubsidyBudget(0); 
                    setTotalLearnerDevBudget(0); 
                    setAllowTeacherProposal(false);
                }

                const depts = STANDARD_DEPTS.map(name => ({
                    id: `dept_${name}`, schoolId: currentUser.schoolId, name,
                    projects: projs ? projs.filter((p: any) => p.department_name === name).map((p: any) => ({
                        id: p.id, name: p.name, 
                        subsidyBudget: Number(p.subsidy_budget) || 0, 
                        learnerDevBudget: Number(p.learner_dev_budget) || 0,
                        actualExpense: Number(p.actual_expense) || 0, 
                        status: p.status, fiscalYear: p.fiscal_year
                    })) : []
                }));
                setDepartments(depts);
            } catch (err) {
                console.error("Load Data Error:", err);
            }
        }
        setIsLoadingData(false);
    };

    useEffect(() => { loadData(); }, [currentUser.schoolId, selectedFiscalYear]);

    const budgetStats = useMemo(() => {
        const allProjects = departments.flatMap(d => d.projects);
        const proposedSubsidy = allProjects.reduce((sum, p) => sum + (Number(p.subsidyBudget) || 0), 0);
        const proposedLearner = allProjects.reduce((sum, p) => sum + (Number(p.learnerDevBudget) || 0), 0);
        const spentSubsidy = allProjects.filter(p => p.status === 'Completed').reduce((sum, p) => sum + (p.subsidyBudget > 0 ? (Number(p.actualExpense) || 0) : 0), 0);
        const spentLearner = allProjects.filter(p => p.status === 'Completed').reduce((sum, p) => sum + (p.learnerDevBudget > 0 ? (Number(p.actualExpense) || 0) : 0), 0);

        return {
            totalProposed: proposedSubsidy + proposedLearner,
            proposedSubsidy,
            proposedLearner,
            remainingAfterProposal: (Number(totalSubsidyBudget) + Number(totalLearnerDevBudget)) - (proposedSubsidy + proposedLearner),
            realSpent: spentSubsidy + spentLearner,
            realRemaining: (Number(totalSubsidyBudget) + Number(totalLearnerDevBudget)) - (spentSubsidy + spentLearner)
        };
    }, [departments, totalSubsidyBudget, totalLearnerDevBudget]);

    const handleDownloadPdf = async () => {
        setIsGeneratingPdf(true);
        try {
            const pdfBase64 = await generateActionPlanPdf({
                schoolName: currentSchool?.name || sysConfig?.schoolName || "โรงเรียน",
                fiscalYear: selectedFiscalYear,
                departments,
                stats: budgetStats,
                officialGarudaBase64: sysConfig?.officialGarudaBase64,
                proxyUrl: sysConfig?.scriptUrl
            });
            const link = document.createElement('a');
            link.href = pdfBase64;
            link.download = `ActionPlan_${selectedFiscalYear}.pdf`;
            link.click();
        } catch (e) { console.error(e); alert("เกิดข้อผิดพลาดในการสร้าง PDF"); } finally { setIsGeneratingPdf(false); }
    };

    const handleExportExcel = () => {
        try {
            const rows: any[][] = [
                [`แผนปฏิบัติการประจำปีงบประมาณ พ.ศ. ${selectedFiscalYear}`],
                [`โรงเรียน ${currentSchool?.name || sysConfig?.schoolName || ""}`],
                [],
                ["ที่", "กลุ่มงาน/ฝ่าย", "ชื่อโครงการ", "งบอุดหนุน (Subsidy)", "งบกิจกรรมพัฒนาผู้เรียน", "ยอดรวมงบแผน", "ใช้จ่ายจริง", "สถานะ"]
            ];
            let globalCounter = 1;
            departments.forEach(dept => {
                dept.projects.forEach(p => {
                    const statusText = p.status === 'Completed' ? 'ปิดยอดแล้ว' : (p.status === 'Approved' ? 'อนุมัติแล้ว' : 'ฉบับร่าง');
                    rows.push([globalCounter++, dept.name, p.name, p.subsidyBudget, p.learnerDevBudget, p.subsidyBudget + p.learnerDevBudget, p.actualExpense || 0, statusText]);
                });
            });
            rows.push([]);
            rows.push(["", "รวมงบประมาณทั้งสิ้น", "", budgetStats.proposedSubsidy, budgetStats.proposedLearner, budgetStats.totalProposed, budgetStats.realSpent, ""]);
            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 45 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 15 }];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "ActionPlan");
            XLSX.writeFile(workbook, `ActionPlan_${selectedFiscalYear}_${currentSchool?.name || 'School'}.xlsx`);
        } catch (e) { alert("ไม่สามารถส่งออกไฟล์ Excel ได้"); }
    };

    const handleSaveBudgetConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setIsSaving(true);
        const id = `budget_${currentUser.schoolId}_${selectedFiscalYear}`;
        try {
            const payload = { 
                id, 
                school_id: currentUser.schoolId, 
                fiscal_year: selectedFiscalYear, 
                subsidy: Number(tempBudgetConfig.subsidy) || 0, 
                learner: Number(tempBudgetConfig.learner) || 0,
                allow_teacher_proposal: tempBudgetConfig.allowProposal
            };
            const { error } = await supabase.from('budget_settings').upsert(payload, { onConflict: 'id' });
            if (error) {
                if (error.message.includes('allow_teacher_proposal')) throw new Error("ฐานข้อมูลยังไม่มีคอลัมน์ 'allow_teacher_proposal' กรุณารันคำสั่ง SQL ALTER ในเมนูแอดมิน");
                throw error;
            }
            setTotalSubsidyBudget(tempBudgetConfig.subsidy); 
            setTotalLearnerDevBudget(tempBudgetConfig.learner); 
            setAllowTeacherProposal(tempBudgetConfig.allowProposal);
            setShowBudgetModal(false); 
            alert("บันทึกการตั้งค่าสำเร็จ");
        } catch (err: any) { alert("บันทึกล้มเหลว: " + err.message); } finally { setIsSaving(false); }
    };

    const handleAddYear = () => {
        if (!newYearInput || newYearInput.length !== 4) { alert("กรุณาระบุปีการศึกษา 4 หลัก"); return; }
        if (availableYears.includes(newYearInput)) { alert("มีปีการศึกษานี้แล้ว"); return; }
        setAvailableYears(prev => [...prev, newYearInput].sort((a,b) => parseInt(b) - parseInt(a)));
        setSelectedFiscalYear(newYearInput);
        setShowAddYearModal(false);
        setNewYearInput('');
    };

    const handleAddProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeDept || !supabase) return;
        setIsSaving(true);
        const id = crypto.randomUUID();
        const amount = parseFloat(newProjectAmount) || 0;
        const data = { 
            id, school_id: currentUser.schoolId, department_name: activeDept.name, name: newProjectName, 
            subsidy_budget: budgetSource === 'Subsidy' ? amount : 0, 
            learner_dev_budget: budgetSource === 'LearnerDev' ? amount : 0, 
            status: 'Draft', fiscal_year: selectedFiscalYear 
        };
        try {
            const { error } = await supabase.from('plan_projects').insert([data]);
            if (error) throw error;
            const newP: Project = { id, name: newProjectName, subsidyBudget: data.subsidy_budget, learnerDevBudget: data.learner_dev_budget, status: 'Draft', fiscalYear: selectedFiscalYear };
            setDepartments(prev => prev.map(d => d.id === activeDept.id ? { ...d, projects: [...d.projects, newP] } : d));
            setNewProjectName(''); setNewProjectAmount('');
            alert("เสนอโครงการเรียบร้อยแล้ว");
        } catch (err: any) { alert("ล้มเหลว: " + err.message); } finally { setIsSaving(false); }
    };

    const handleUpdateProjectBudget = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProject || !supabase) return;
        setIsSaving(true);
        const { project } = editingProject;
        const { error } = await supabase.from('plan_projects').update({ name: project.name, subsidy_budget: project.subsidyBudget, learner_dev_budget: project.learnerDevBudget }).eq('id', project.id);
        if (!error) {
            setDepartments(prev => prev.map(d => d.id === editingProject.deptId ? { ...d, projects: d.projects.map(p => p.id === project.id ? project : p) } : d));
            setShowEditProjectModal(false);
            alert("ปรับปรุงสำเร็จ");
        }
        setIsSaving(false);
    };

    const handleStatusChange = async (deptId: string, projectId: string, newStatus: ProjectStatus) => {
        if (!supabase) return;
        const { error } = await supabase.from('plan_projects').update({ status: newStatus }).eq('id', projectId);
        if (!error) setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, projects: d.projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p) } : d));
    };

    const handleSaveSettlement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settleProjectData || !supabase) return;
        const amt = parseFloat(actualAmountInput);
        const { error } = await supabase.from('plan_projects').update({ status: 'Completed', actual_expense: amt }).eq('id', settleProjectData.project.id);
        if (!error) {
            setDepartments(prev => prev.map(d => d.id === settleProjectData.deptId ? { ...d, projects: d.projects.map(p => p.id === settleProjectData.project.id ? { ...p, status: 'Completed', actualExpense: amt } : p) } : d));
            setShowSettlementModal(false);
            alert("ปิดโครงการเรียบร้อย");
        }
    };

    const handleDeleteProject = async (deptId: string, projId: string) => {
        if (!confirm("ลบโครงการนี้?")) return;
        if (!supabase) return;
        const { error } = await supabase.from('plan_projects').delete().eq('id', projId);
        if (!error) setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, projects: d.projects.filter(p => p.id !== projId) } : d));
    };

    if (isLoadingData) return <div className="p-20 text-center animate-pulse flex flex-col items-center gap-4"><Loader className="animate-spin text-indigo-600" size={32}/><p className="font-bold text-slate-400 text-xs uppercase tracking-widest">Synchronizing SQL Data...</p></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20 font-sarabun">
            {viewMode === 'OVERVIEW' ? (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                        <div className="flex items-center gap-4">
                            <div className="p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-lg shadow-indigo-100"><CalendarRange size={32}/></div>
                            <div><h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">แผนปฏิบัติการสถานศึกษา</h2><p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Fiscal Year Budget & Project Management</p></div>
                        </div>
                        <div className="flex flex-wrap justify-center md:justify-end gap-3 w-full md:w-auto">
                            <button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="p-3.5 bg-slate-800 text-white hover:bg-black rounded-2xl transition-all shadow-xl active:scale-95 flex items-center gap-2" title="PDF">{isGeneratingPdf ? <Loader className="animate-spin" size={20}/> : <Download size={22}/>}<span className="hidden md:inline text-xs font-black uppercase tracking-widest">PDF</span></button>
                            <button onClick={handleExportExcel} className="p-3.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center gap-2" title="Excel"><FileSpreadsheet size={22}/><span className="hidden md:inline text-xs font-black uppercase tracking-widest">Excel</span></button>
                            <div className="flex bg-slate-50 rounded-2xl p-1 shadow-inner border border-slate-100 items-center"><select value={selectedFiscalYear} onChange={e => setSelectedFiscalYear(e.target.value)} className="px-4 py-2 bg-transparent rounded-xl font-black text-slate-600 outline-none transition-all">{availableYears.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}</select>{isAdmin && <button onClick={() => setShowAddYearModal(true)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="เพิ่มปี"><CalendarPlus size={20}/></button>}</div>
                            {isPlanOfficer && <button onClick={() => { setTempBudgetConfig({subsidy: totalSubsidyBudget, learner: totalLearnerDevBudget, allowProposal: allowTeacherProposal}); setShowBudgetModal(true); }} className="p-3.5 bg-slate-800 text-white hover:bg-black rounded-2xl transition-all shadow-xl active:scale-95"><Settings size={22}/></button>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-[2rem] border-2 border-indigo-50 shadow-sm space-y-4">
                            <div className="flex justify-between items-center"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp size={24}/></div><span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Proposed Total</span></div>
                            <div><p className="text-xs font-black text-slate-400 mb-1">ยอดเสนอโครงการรวม</p><p className="text-2xl font-black text-indigo-600">฿{budgetStats.totalProposed.toLocaleString()}</p></div>
                        </div>
                        <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-50 shadow-sm space-y-4">
                            <div className="flex justify-between items-center"><div className="p-3 bg-slate-50 text-slate-400 rounded-xl"><PieChart size={24}/></div><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Allocation Gap</span></div>
                            <div><p className="text-xs font-black text-slate-400 mb-1">งบประมาณคงเหลือ (หลังจัดสรร)</p><p className={`text-2xl font-black ${budgetStats.remainingAfterProposal < 0 ? 'text-rose-600' : 'text-slate-800'}`}>฿{budgetStats.remainingAfterProposal.toLocaleString()}</p></div>
                        </div>
                        <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-[2rem] border-2 border-orange-100 shadow-sm space-y-4">
                            <div className="flex justify-between items-center"><div className="p-3 bg-white text-orange-600 rounded-xl shadow-sm"><Wallet size={24}/></div><span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Subsidy Budget</span></div>
                            <div><p className="text-xs font-black text-orange-800/60 mb-1">คงเหลือจริง: งบอุดหนุน</p><p className="text-2xl font-black text-orange-600">฿{(totalSubsidyBudget - budgetStats.proposedSubsidy).toLocaleString()}</p></div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-[2rem] border-2 border-blue-100 shadow-sm space-y-4">
                            <div className="flex justify-between items-center"><div className="p-3 bg-white text-blue-600 rounded-xl shadow-sm"><Coins size={24}/></div><span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Learner Dev</span></div>
                            <div><p className="text-xs font-black text-blue-800/60 mb-1">คงเหลือจริง: งบกิจกรรม</p><p className="text-2xl font-black text-blue-600">฿{(totalLearnerDevBudget - budgetStats.proposedLearner).toLocaleString()}</p></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {departments.map((dept, index) => {
                            const deptAllocated = dept.projects.reduce((sum, p) => sum + p.subsidyBudget + p.learnerDevBudget, 0);
                            const deptSpent = dept.projects.reduce((sum, p) => sum + (p.actualExpense || 0), 0);
                            const style = getDeptStyle(dept.name);
                            const gradients = [
                                'from-blue-500 to-indigo-600',
                                'from-orange-500 to-amber-600',
                                'from-emerald-500 to-teal-600',
                                'from-slate-600 to-slate-800',
                                'from-rose-500 to-pink-600'
                            ];
                            const gradient = gradients[index % gradients.length];
                            return (
                                <div 
                                    key={dept.id} 
                                    onClick={() => { setSelectedDept(dept); setViewMode('DETAIL'); }} 
                                    className={`relative p-8 rounded-[2.5rem] shadow-lg hover:shadow-2xl cursor-pointer transition-all group hover:-translate-y-2 overflow-hidden bg-gradient-to-br ${gradient} text-white border-none`}
                                >
                                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-150 group-hover:rotate-12 transition-all duration-700 text-white">
                                        {React.createElement(style.icon, { size: 140 })}
                                    </div>
                                    <div className="bg-white/20 backdrop-blur-md p-4 w-fit rounded-2xl transition-all mb-6 shadow-xl border border-white/20 text-white">
                                        {React.createElement(style.icon, { size: 28 })}
                                    </div>
                                    <h4 className="font-black text-xl text-white mb-2 leading-tight drop-shadow-md">{dept.name}</h4>
                                    <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-6">{dept.projects.length} โครงการในกลุ่มงาน</p>
                                    <div className="space-y-3 border-t pt-6 border-white/20">
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-white/70">งบประมาณจัดสรร:</span>
                                            <span className="text-white font-black">฿{deptAllocated.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-white/70">ใช้จ่ายจริงแล้ว:</span>
                                            <span className="text-white font-black">฿{deptSpent.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                                        <ArrowRight className="text-white"/>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : activeDept && (
                <div className="space-y-6 animate-slide-up">
                    <button onClick={() => setViewMode('OVERVIEW')} className="flex items-center gap-3 text-slate-400 font-black hover:text-indigo-600 uppercase tracking-widest text-xs transition-colors group"><ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform"/> กลับหน้าภาพรวม</button>
                    <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-xl border border-slate-100">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b pb-8 border-slate-50">
                            <div className="flex items-center gap-6">
                                <div className={`p-5 rounded-3xl ${getDeptStyle(activeDept.name).bgClass} ${getDeptStyle(activeDept.name).colorClass} border border-white shadow-sm`}>{React.createElement(getDeptStyle(activeDept.name).icon, { size: 32 })}</div>
                                <div><h2 className="text-3xl font-black text-slate-800 tracking-tight">{activeDept.name}</h2><p className={`${getDeptStyle(activeDept.name).colorClass} font-bold uppercase tracking-[0.2em] text-xs mt-1`}>ปีงบประมาณ {selectedFiscalYear}</p></div>
                            </div>
                            <div className="bg-slate-50 p-4 px-6 rounded-2xl border border-slate-100 shadow-inner"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">งบรวมกลุ่มงาน (Allocated)</p><p className="text-2xl font-black text-slate-800">฿{activeDept.projects.reduce((sum, p) => sum + p.subsidyBudget + p.learnerDevBudget, 0).toLocaleString()}</p></div>
                        </div>
                        {(allowTeacherProposal || isAdmin) && (
                            <div className="bg-indigo-50/50 p-6 md:p-8 rounded-[2rem] border-2 border-indigo-100 border-dashed mb-10 group">
                                <h4 className="font-black text-indigo-900 text-lg mb-6 flex items-center gap-3"><Plus className="bg-indigo-600 text-white rounded-lg p-1" size={24}/>{isAdmin ? 'เพิ่มโครงการ/งบประมาณใหม่' : 'เสนอโครงการใหม่เข้าสู่แผน'}</h4>
                                <form onSubmit={handleAddProject} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                    <div className="md:col-span-6"><input required placeholder="ชื่อโครงการ..." className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500 transition-all shadow-sm" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}/></div>
                                    <div className="md:col-span-3 flex bg-white rounded-2xl p-1.5 border-2 border-slate-100 shadow-sm"><button type="button" onClick={() => setBudgetSource('Subsidy')} className={`flex-1 rounded-xl text-xs font-black transition-all ${budgetSource === 'Subsidy' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>เงินอุดหนุน</button><button type="button" onClick={() => setBudgetSource('LearnerDev')} className={`flex-1 rounded-xl text-xs font-black transition-all ${budgetSource === 'LearnerDev' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>เงินกิจกรรม</button></div>
                                    <div className="md:col-span-2"><input required type="number" placeholder="ยอดเงิน" className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-sm" value={newProjectAmount} onChange={e => setNewProjectAmount(e.target.value)}/></div>
                                    <div className="md:col-span-1"><button type="submit" disabled={isSaving} className="w-full h-full bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all flex items-center justify-center shadow-lg disabled:opacity-50">{isSaving ? <Loader className="animate-spin" size={24}/> : <CheckSquare size={24}/>}</button></div>
                                </form>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b"><tr><th className="p-6">ชื่อโครงการ</th><th className="p-6 text-right">งบที่เสนอ/จัดสรร</th><th className="p-6 text-center">ใช้จ่ายจริง</th><th className="p-6 text-center">สถานะ</th><th className="p-6 text-right">จัดการ</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">{activeDept.projects.length === 0 ? <tr><td colSpan={5} className="p-20 text-center text-slate-300 font-bold italic uppercase tracking-widest">ยังไม่มีโครงการ</td></tr> : activeDept.projects.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-6"><div className="font-black text-slate-800 text-base mb-1">{p.name}</div><div className="text-[10px] font-bold text-slate-400">{p.subsidyBudget > 0 ? 'เงินอุดหนุนรายหัว' : 'เงินกิจกรรมพัฒนาผู้เรียน'}</div></td>
                                        <td className="p-6 text-right font-black text-slate-700">{(p.subsidyBudget+p.learnerDevBudget).toLocaleString()}</td>
                                        <td className="p-6 text-center font-black text-emerald-600 bg-emerald-50/20">{p.actualExpense?.toLocaleString() || '-'}</td>
                                        <td className="p-6 text-center">{p.status === 'Completed' ? <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black border border-emerald-200 shadow-sm flex items-center gap-1 justify-center"><CheckCircle size={10}/> ปิดยอด</span> : p.status === 'Approved' ? <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black border border-blue-200">อนุมัติ</span> : <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black border border-slate-200">ฉบับร่าง</span>}</td>
                                        <td className="p-6 text-right"><div className="flex justify-end gap-2">{isAdmin && <button onClick={() => { setEditingProject({deptId: activeDept.id, project: {...p}}); setShowEditProjectModal(true); }} className="p-2 text-slate-400 hover:text-indigo-600 bg-white border rounded-xl shadow-sm transition-all"><Edit3 size={16}/></button>}{isDirector && p.status === 'Draft' && <button onClick={() => handleStatusChange(activeDept.id, p.id, 'Approved')} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-indigo-700 transition-all">อนุมัติ</button>}{isPlanOfficer && p.status === 'Approved' && <button onClick={() => { setSettleProjectData({deptId: activeDept.id, project: p}); setActualAmountInput((p.subsidyBudget+p.learnerDevBudget).toString()); setShowSettlementModal(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-emerald-700 transition-all">สรุปยอดจ่าย</button>}{isAdmin && p.status === 'Draft' && <button onClick={() => handleDeleteProject(activeDept.id, p.id)} className="p-2 text-slate-300 hover:text-rose-600 transition-all"><Trash2 size={16}/></button>}</div></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showBudgetModal && (
                <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-10 border-4 border-slate-50 animate-scale-up">
                        <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Settings className="text-slate-400"/> ตั้งค่าระบบแผน</h3><button onClick={() => setShowBudgetModal(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={24}/></button></div>
                        <form onSubmit={handleSaveBudgetConfig} className="space-y-6">
                            <div onClick={() => setTempBudgetConfig({...tempBudgetConfig, allowProposal: !tempBudgetConfig.allowProposal})} className={`p-4 rounded-2xl border-2 flex justify-between items-center cursor-pointer transition-all ${tempBudgetConfig.allowProposal ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 grayscale'}`}>
                                <div><p className="font-black text-sm text-indigo-900">เปิดรับข้อเสนอโครงการ</p><p className="text-[10px] font-bold text-indigo-400">อนุญาตให้คุณครูเพิ่มโครงการใหม่ได้</p></div>
                                {tempBudgetConfig.allowProposal ? <ToggleRight className="text-indigo-600" size={36}/> : <ToggleLeft className="text-slate-300" size={36}/>}
                            </div>
                            <div><label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2 ml-1">เงินงบประมาณอุดหนุนจริง (Subsidy)</label><input required type="number" className="w-full px-6 py-4 border-2 border-slate-100 rounded-2xl font-black text-2xl text-orange-600 outline-none focus:border-orange-500 bg-slate-50 shadow-inner" value={tempBudgetConfig.subsidy} onChange={e => setTempBudgetConfig({...tempBudgetConfig, subsidy: parseFloat(e.target.value) || 0})}/></div>
                            <div><label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 ml-1">เงินกิจกรรมพัฒนาผู้เรียนจริง</label><input required type="number" className="w-full px-6 py-4 border-2 border-slate-100 rounded-2xl font-black text-2xl text-blue-600 outline-none focus:border-blue-500 bg-slate-50 shadow-inner" value={tempBudgetConfig.learner} onChange={e => setTempBudgetConfig({...tempBudgetConfig, learner: parseFloat(e.target.value) || 0})}/></div>
                            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setShowBudgetModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs">ยกเลิก</button><button type="submit" disabled={isSaving} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3">{isSaving ? <RefreshCw className="animate-spin" size={24}/> : <Save size={24}/>} บันทึกตั้งค่า</button></div>
                        </form>
                    </div>
                </div>
            )}

            {showEditProjectModal && editingProject && (
                <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 border-4 border-indigo-100 animate-scale-up">
                        <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black text-slate-800 flex items-center gap-3"><Edit3 className="text-indigo-600"/> ปรับปรุงงบประมาณ</h3><button onClick={() => setShowEditProjectModal(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={24}/></button></div>
                        <form onSubmit={handleUpdateProjectBudget} className="space-y-6">
                            <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">ชื่อโครงการ</label><input required className="w-full px-6 py-4 border-2 border-slate-100 rounded-2xl font-bold bg-slate-50" value={editingProject.project.name} onChange={e => setEditingProject({...editingProject, project: {...editingProject.project, name: e.target.value}})}/></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-[10px] font-black text-orange-600 uppercase mb-2">เงินอุดหนุน (บาท)</label><input type="number" className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-black text-orange-600" value={editingProject.project.subsidyBudget} onChange={e => setEditingProject({...editingProject, project: {...editingProject.project, subsidyBudget: parseFloat(e.target.value) || 0}})}/></div>
                                <div><label className="block text-[10px] font-black text-blue-600 uppercase mb-2">เงินกิจกรรม (บาท)</label><input type="number" className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-black text-blue-600" value={editingProject.project.learnerDevBudget} onChange={e => setEditingProject({...editingProject, project: {...editingProject.project, learnerDevBudget: parseFloat(e.target.value) || 0}})}/></div>
                            </div>
                            <button type="submit" disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">{isSaving ? <RefreshCw className="animate-spin" size={24}/> : <Save size={24}/>} ยืนยันการปรับปรุง</button>
                        </form>
                    </div>
                </div>
            )}

            {showSettlementModal && settleProjectData && (
                <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-sm p-10 text-center border-4 border-emerald-100 animate-scale-up">
                        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Coins size={40}/></div>
                        <h3 className="text-xl font-black text-slate-800 mb-2">บันทึกยอดใช้จ่ายจริง</h3>
                        <p className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest truncate">{settleProjectData.project.name}</p>
                        <form onSubmit={handleSaveSettlement} className="space-y-6">
                            <div className="relative"><span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xl">฿</span><input autoFocus required type="number" step="0.01" className="w-full pl-12 pr-6 py-6 border-4 border-slate-50 rounded-[2rem] text-center text-4xl font-black text-emerald-700 outline-none focus:border-emerald-500 bg-slate-50 shadow-inner transition-all" value={actualAmountInput} onChange={e => setActualAmountInput(e.target.value)}/></div>
                            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setShowSettlementModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs">ยกเลิก</button><button type="submit" className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-700 transition-all active:scale-95">ปิดโครงการ</button></div>
                        </form>
                    </div>
                </div>
            )}

            {showAddYearModal && (
                <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-10 border-4 border-indigo-100 animate-scale-up">
                        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black text-slate-800 flex items-center gap-3"><CalendarPlus className="text-indigo-600"/> เพิ่มปีงบประมาณ</h3><button onClick={() => setShowAddYearModal(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={20}/></button></div>
                        <div className="space-y-4"><input autoFocus type="number" placeholder="พ.ศ. (4 หลัก)" value={newYearInput} onChange={e => setNewYearInput(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-center text-3xl outline-none focus:border-indigo-500 transition-all"/><div className="flex gap-3"><button onClick={() => setShowAddYearModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs">ยกเลิก</button><button onClick={handleAddYear} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95">เพิ่มปี</button></div></div>
                    </div>
                </div>
            )}
            <style>{`.animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; } @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
        </div>
    );
};

export default ActionPlanSystem;