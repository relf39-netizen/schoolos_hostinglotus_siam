import { 
    AlertTriangle, 
    ArrowLeft, 
    Bell, 
    CheckCircle, 
    CheckSquare, 
    ChevronLeft, 
    ChevronRight, 
    ChevronsLeft, 
    ChevronsRight, 
    ExternalLink, 
    FastForward, 
    FileBadge, 
    FileCheck, 
    FileIcon, 
    FilePlus, 
    FileText, 
    Info, 
    Link as LinkIcon, 
    Loader, 
    Megaphone, 
    PenTool, 
    Plus, 
    Save, 
    Search, 
    Send, 
    Trash2, 
    UploadCloud, 
    UserCheck, 
    UserMinus, 
    UserPlus, 
    Users, 
    X, 
    Zap, 
    DownloadCloud, 
    History, 
    Clock, 
    Bookmark, 
    ChevronDown,
    Building,
    Settings,
    Layout,
    Globe,
    Edit3,
    RefreshCw
} from 'lucide-react';
import React, { useEffect, useState, useMemo } from 'react';
import { supabase, isConfigured as isSupabaseConfigured } from '@/supabaseClient';
import { Attachment, DocumentItem, School, SystemConfig, Teacher } from '@/types';
import { stampPdfDocument, stampReceiveNumber, generateDirectorCommandMemoPdf, stampAcknowledgePdf, generateAcknowledgeMemoPdf } from '@/utils/pdfStamper';
import { sendTelegramMessage } from '@/utils/telegram';

/**
 * Interface for tracking background tasks like PDF stamping or uploads
 */
interface BackgroundTask {
    id: string;
    title: string;
    status: 'processing' | 'uploading' | 'done' | 'error';
    message: string;
    notified?: boolean; 
}

interface DocumentsSystemProps {
    currentUser: Teacher;
    currentSchool: School; 
    allTeachers: Teacher[];
    focusDocId?: string | null;
    onClearFocus?: () => void;
}

const getCleanBase64 = (base64Str: string): string => {
    if (!base64Str) return '';
    const parts = base64Str.split(',');
    return (parts.length > 1 ? parts[1] : parts[0]).replace(/[\s\n\r]/g, ''); 
};

/**
 * getGoogleDriveId: ดึง ID ของ Google Drive ไฟล์จาก URL ทุกรูปแบบ
 */
const getGoogleDriveId = (url: string) => {
    if (!url) return null;
    // พยายามดึงสตริงที่ดูเหมือน ID (ยาว 25-50 ตัวอักษร) ซึ่งเป็นรูปแบบมาตรฐานของ Google Drive ID
    const match = url.match(/[-\w]{25,50}/);
    if (match) return match[0];
    return null;
};

/**
 * getPreviewUrl: บังคับรูปแบบหน้า Viewer ของ Google Drive เพื่อให้เปิดบน Browser ก่อน
 */
const getPreviewUrl = (url: string) => {
    if (!url) return '';
    const id = getGoogleDriveId(url);
    if (id) {
        return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
    }
    return url.replace(/export=download/gi, 'export=view')
              .replace(/dl=1/gi, 'dl=0');
};

/**
 * DocumentsSystem: A comprehensive school document management system.
 * Handles incoming documents, hierarchical commands, and national/school orders.
 */
const DocumentsSystem: React.FC<DocumentsSystemProps> = ({ 
    currentUser, 
    currentSchool, 
    allTeachers, 
    focusDocId, 
    onClearFocus 
}) => {
    // --- Core State Management ---
    const [docs, setDocs] = useState<DocumentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
    const [showTaskQueue, setShowTaskQueue] = useState(false);
    
    // --- Pagination & Filter State ---
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'ALL' | 'INCOMING' | 'ORDER' | 'OUTGOING' | 'PENDING' | 'UNREAD'>('ALL');
    const ITEMS_PER_PAGE = 10;
    
    // --- Configuration & Navigation ---
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
    const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSavingForm, setIsSavingForm] = useState(false);

    // --- Agency Management State (หน่วยงานต้นเรื่อง) ---
    const [showAgencyManager, setShowAgencyManager] = useState(false);
    const [newAgencyInput, setNewAgencyInput] = useState('');
    const [selectedOfficerDept, setSelectedOfficerDept] = useState('');

    // --- Form State (Document Creation) ---
    const [docCategory, setDocCategory] = useState<'INCOMING' | 'ORDER' | 'OUTGOING'>('INCOMING');
    const [newDoc, setNewDoc] = useState({ 
        id: '',
        bookNumber: '', 
        title: '', 
        from: '', 
        priority: 'Normal' as any, 
        description: '' // รายละเอียดหนังสือ
    });
    
    // --- Attachment Handling ---
    const [tempAttachments, setTempAttachments] = useState<Attachment[]>([]);
    const [linkInput, setLinkInput] = useState('');
    
    // --- Command Action State ---
    const [command, setCommand] = useState('');
    const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
    const [stampPage, setStampPage] = useState<number>(1);
    const [assignedViceDirId, setAssignedViceDirId] = useState<string>(''); 
    const [teacherSearchTerm, setTeacherSearchTerm] = useState('');

    // --- Permissions / Role Detection ---
    const isDirector = (currentUser.roles || []).includes('DIRECTOR') || currentUser.isActingDirector;
    const isViceDirector = (currentUser.roles || []).includes('VICE_DIRECTOR'); 
    const isDocOfficer = (currentUser.roles || []).includes('DOCUMENT_OFFICER');
    const isSystemAdmin = (currentUser.roles || []).includes('SYSTEM_ADMIN');
    const canManageDoc = isDirector || isDocOfficer || isSystemAdmin;

    // --- Data Preparation ---
    const teachersInSchool = useMemo(() => 
        allTeachers.filter(t => 
            t.schoolId === currentUser.schoolId && 
            !(t.roles || []).includes('DIRECTOR') &&
            !t.isSuspended
        ).sort((a, b) => a.name.localeCompare(b.name, 'th')),
    [allTeachers, currentUser.schoolId]);

    const viceDirectors = useMemo(() => 
        teachersInSchool.filter(t => 
            (t.position || '').includes('รองผู้อำนวยการ') || (t.roles || []).includes('VICE_DIRECTOR')
        ),
    [teachersInSchool]);

    const pendingDirectorCount = useMemo(() => docs.filter(d => d.status === 'PendingDirector').length, [docs]);
    const unreadDocCount = useMemo(() => 
        docs.filter(d => 
            d.status === 'Distributed' && 
            (d.targetTeachers || []).includes(currentUser.id) && 
            !(d.acknowledgedBy || []).includes(currentUser.id)
        ).length, 
    [docs, currentUser.id]);

    // --- Task Queue Helpers ---
    const activeTasks = backgroundTasks.filter(t => t.status === 'processing' || t.status === 'uploading');
    const doneTasksCount = backgroundTasks.filter(t => t.status === 'done').length;

    const updateTask = (id: string, updates: Partial<BackgroundTask>) => {
        setBackgroundTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const removeTask = (id: string) => {
        setBackgroundTasks(prev => prev.filter(t => t.id !== id));
    };

    const autoRemoveDoneTask = (id: string) => {
        setTimeout(() => {
            setBackgroundTasks(prev => prev.filter(t => t.id !== id));
        }, 8000); 
    };

    // --- Document Mapping & Sort Helpers ---
    const parseBookNumberForSort = (bn: string) => {
        if (!bn) return { num: 0, year: 0 };
        const parts = bn.split('/');
        return {
            num: parseInt(parts[0]) || 0,
            year: parseInt(parts[1]) || 0
        };
    };

    const mapDocFromDb = (d: any): DocumentItem => ({
        id: d.id.toString(),
        schoolId: d.school_id,
        category: d.category,
        bookNumber: d.book_number,
        title: d.title,
        description: d.description,
        from: d.from,
        date: d.date,
        timestamp: d.timestamp,
        priority: d.priority,
        attachments: d.attachments || [],
        status: d.status,
        directorCommand: d.director_command,
        directorSignatureDate: d.director_signature_date,
        signedFileUrl: d.signed_file_url,
        assignedViceDirectorId: d.assigned_vice_director_id,
        viceDirectorCommand: d.vice_director_command,
        viceDirectorSignatureDate: d.vice_director_signature_date,
        targetTeachers: d.target_teachers || [],
        acknowledgedBy: d.acknowledged_by || []
    });

    const mapDocToDb = (d: any) => ({
        school_id: d.schoolId,
        category: d.category,
        book_number: d.bookNumber,
        title: d.title,
        description: d.description,
        from: d.from,
        date: d.date,
        timestamp: d.timestamp,
        priority: d.priority,
        attachments: d.attachments,
        status: d.status,
        director_command: d.directorCommand,
        director_signature_date: d.directorSignatureDate,
        signed_file_url: d.signed_file_url,
        assigned_vice_director_id: d.assigned_vice_director_id,
        vice_director_command: d.vice_director_command,
        vice_director_signature_date: d.vice_director_signature_date,
        target_teachers: d.targetTeachers,
        acknowledged_by: d.acknowledgedBy
    });

    // --- Core Logic Handlers ---

    async function handleTeacherAcknowledge(docId: string, currentAckList: string[]) {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        
        if (!currentAckList.includes(currentUser.id)) {
            const newAck = [...currentAckList, currentUser.id];
            try {
                const { error } = await client.from('documents').update({ acknowledged_by: newAck }).eq('id', docId);
                if (error) throw error;
                
                setDocs(prev => prev.map(d => d.id === docId ? { ...d, acknowledgedBy: newAck } : d));
                if (selectedDoc?.id === docId) { 
                    setSelectedDoc(prev => prev ? { ...prev, acknowledgedBy: newAck } : null); 
                }
            } catch (e) {
                console.error("Acknowledgement Error:", e);
            }
        }
    }

    const fetchDocs = async () => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        const { data, error } = await client
            .from('documents')
            .select('*')
            .eq('school_id', currentUser.schoolId);
        
        if (!error && data) {
            const mapped = data.map(mapDocFromDb);
            mapped.sort((a: DocumentItem, b: DocumentItem) => {
                const pA = parseBookNumberForSort(a.bookNumber);
                const pB = parseBookNumberForSort(b.bookNumber);
                if (pB.year !== pA.year) return pB.year - pA.year;
                return pB.num - pA.num;
            });
            setDocs(mapped);
            if (selectedDoc) {
                const updatedSelected = mapped.find((d: DocumentItem) => d.id === selectedDoc.id);
                if (updatedSelected) setSelectedDoc(updatedSelected);
            }
        }
        setIsLoading(false);
    };

    const handleDeleteDoc = async (docId: string) => {
        if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบหนังสือราชการชิ้นนี้ถาวร?")) return;
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        try {
            const { error } = await client.from('documents').delete().eq('id', docId);
            if (error) throw error;
            alert("ลบหนังสือเรียบร้อยแล้ว");
            setViewMode('LIST');
            fetchDocs();
        } catch (e: any) {
            alert("ลบไม่สำเร็จ: " + e.message);
        }
    };

    const handleSaveAgencies = async (agencies: string[]) => {
        const client = supabase;
        if (!client) return;
        // ปรับเป็น upsert เพื่อป้องกันกรณีไม่มีแถวข้อมูลในครั้งแรก
        const { error } = await client.from('school_configs').upsert({ 
            school_id: currentUser.schoolId,
            external_agencies: agencies 
        }, { onConflict: 'school_id' });

        if (!error) {
            setSysConfig(prev => prev ? { ...prev, externalAgencies: agencies } : null);
        } else {
            alert("บันทึกล้มเหลว: " + error.message);
        }
    };

    const handleAddExternalAgency = () => {
        if (!newAgencyInput.trim()) return;
        const currentAgencies = sysConfig?.externalAgencies || [];
        if (currentAgencies.includes(newAgencyInput.trim())) {
            alert("มีหน่วยงานนี้อยู่ในรายชื่อแล้ว");
            return;
        }
        const updated = [...currentAgencies, newAgencyInput.trim()];
        handleSaveAgencies(updated);
        setNewAgencyInput('');
    };

    const handleRemoveExternalAgency = (agency: string) => {
        const currentAgencies = sysConfig?.externalAgencies || [];
        const updated = currentAgencies.filter(a => a !== agency);
        handleSaveAgencies(updated);
    };

    /**
     * ระบบ Tracking Link อัตโนมัติ (v12.5)
     * ส่งคุณครูไปที่ Google Apps Script Bridge เพื่อแสดงหน้าจอที่มีปุ่มกดเปิดเอกสาร
     * เพื่อให้ระบบรับทราบการกดจาก Telegram ได้อย่างแม่นยำ
     */
    async function triggerTelegramNotification(teachers: Teacher[], docId: string, title: string, bookNumber: string, isOrder: boolean, fromStr: string, attachments: Attachment[] = [], customTitle?: string, priority: string = 'Normal') {
        if (!sysConfig?.telegramBotToken || !sysConfig?.scriptUrl) return;
        const baseUrl = sysConfig.appBaseUrl || window.location.origin;
        const scriptUrl = sysConfig.scriptUrl;

        teachers.forEach(t => {
            if (!t.telegramChatId) return;

            const isRecipientDirector = t.roles.includes('DIRECTOR') || t.isActingDirector;
            
            // จัดรูปแบบความเร่งด่วน
            let priorityText = 'ปกติ';
            if (priority === 'Urgent') priorityText = '<b>⚠️ ด่วน</b>';
            if (priority === 'Critical') priorityText = '<b>🚨 ด่วนที่สุด</b>';

            let message = `<b>${customTitle || (isOrder ? '📝 มีคำสั่งปฏิบัติราชการใหม่' : '📩 มีหนังสือราชการใหม่')}</b>\n` +
                            `----------------------------------\n`;
            
            // ถ้าเป็น ผอ. ไม่ต้องแสดงเลขที่หนังสือ แต่แสดงความเร่งด่วนแทน
            if (isRecipientDirector) {
                message += `<b>ความเร่งด่วน:</b> ${priorityText}\n`;
            } else {
                message += `<b>เลขที่:</b> ${bookNumber}\n`;
            }

            message += `<b>เรื่อง:</b> ${title}\n` +
                       `<b>จาก:</b> ${fromStr}\n` +
                       `----------------------------------\n`;
            
            if (attachments && attachments.length > 0) {
                message += `<b>📎 กดเปิดเพื่อดูเอกสาร${isRecipientDirector ? '' : 'และรับทราบ'}:</b>\n`;
                attachments.forEach((att, idx) => {
                    const directFileUrl = getPreviewUrl(att.url);
                    const finalLink = isRecipientDirector 
                        ? directFileUrl 
                        : `${scriptUrl}?action=ack&docId=${docId}&userId=${t.id}&target=${encodeURIComponent(att.url)}&appUrl=${encodeURIComponent(baseUrl)}`;
                    
                    // ชื่อไฟล์สั้นๆ ตามคำขอ
                    message += `${idx + 1}. <a href="${finalLink}">ไฟล์ที่ ${idx + 1}</a>\n`;
                });
                message += `----------------------------------\n`;
            }

            if (!isRecipientDirector) {
                message += `✅ ระบบจะนำคุณไปที่หน้าเอกสารเพื่อบันทึกการรับทราบทันทีที่กดปุ่มครับ`;
            }
            
            const appMainLink = `${baseUrl}?view=DOCUMENTS&id=${docId}`;
            sendTelegramMessage(sysConfig.telegramBotToken!, t.telegramChatId, message, appMainLink);
        });
    }

    const handleFetchAndUploadFromUrl = async (url: string, customName?: string) => {
        const client = supabase;
        if (!sysConfig?.scriptUrl?.trim() || !sysConfig?.driveFolderId?.trim() || !client) {
            alert("ไม่พบการตั้งค่า Google Drive! กรุณาตรวจสอบการตั้งค่าในเมนูตั้งค่าระบบ");
            return;
        }

        const taskId = `fetch_${Date.now()}`;
        const finalName = customName || `link_file_${Date.now()}.pdf`;
        
        setBackgroundTasks(prev => [...prev, { 
            id: taskId, 
            title: `ลิงก์คลาวด์: ${finalName}`, 
            status: 'uploading', 
            message: 'กำลังส่งคำสั่งดึงไฟล์จากต้นทาง...', 
            notified: false 
        }]);

        if (!sysConfig?.scriptUrl?.trim() || !sysConfig?.driveFolderId?.trim()) {
            updateTask(taskId, { status: 'error', message: 'ขัดข้อง: ไม่พบการตั้งค่า Google Drive' });
            return;
        }

        try {
            const trimmedUrl = url.trim();
            const protocolPart = trimmedUrl.indexOf('https://') === 0 ? 'https://' : 'http://';
            const normalizedUrl = protocolPart + trimmedUrl.replace(protocolPart, "").replace(/\/+/g, "/");

            updateTask(taskId, { message: 'กำลังดาวน์โหลดไฟล์ผ่าน Deep Proxy Bridge...' });
            const response = await fetch(sysConfig.scriptUrl.trim(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'fetchRemote', url: normalizedUrl }),
                redirect: 'follow'
            });

            if (!response.ok) throw new Error("Cloud Bridge Connection Error");
            
            const responseText = await response.text();
            if (responseText.trim().startsWith('error:')) {
                const errMsg = responseText.trim().replace('error:', '').trim();
                if (errMsg.includes('DriveApp') || errMsg.includes('Permission')) {
                    throw new Error(`ไม่ได้รับอนุญาตให้เข้าถึง Google Drive (DriveApp Error)\n\nรายละเอียด: ${errMsg}\n\nวิธีแก้ไข:\n1. ไปที่เมนู "ตั้งค่าระบบ" ในแอปนี้\n2. คัดลอกโค้ดสคริปต์ใหม่ (v15.1)\n3. นำไปวางใน Google Apps Script แทนที่ของเดิม\n4. กด "เรียกใช้" ฟังก์ชัน A_RUN_ME_FIRST_initialSetup เพื่อให้สิทธิ์\n5. สำคัญมาก: กด "Deploy" -> "Manage Deployments" -> "Edit" -> เลือก Version เป็น "New Version" แล้วกด Deploy`);
                }
                throw new Error(errMsg);
            }

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                throw new Error("เซิร์ฟเวอร์ตอบกลับด้วยรูปแบบที่ไม่ถูกต้อง (Invalid JSON): " + responseText.substring(0, 100));
            }

            if (result.status !== 'success' || !result.fileData) {
                throw new Error(result.message || "ไม่สามารถเข้าถึงไฟล์ต้นทางได้");
            }

            let fileData = `data:${result.mimeType};base64,${result.fileData}`;

            if (result.mimeType === 'application/pdf' && docCategory === 'INCOMING' && !isEditMode) {
                updateTask(taskId, { message: 'กำลังประทับตราเลขรับอัตโนมัติ...' });
                try {
                    fileData = await stampReceiveNumber({
                        fileBase64: fileData,
                        bookNumber: newDoc.bookNumber || "XXX/XXXX",
                        date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
                        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
                        schoolName: currentSchool.name,
                        schoolLogoBase64: sysConfig.officialGarudaBase64,
                        proxyUrl: sysConfig.scriptUrl 
                    });
                } catch (e) {
                    console.warn("Stamping link file failed", e);
                }
            }

            updateTask(taskId, { message: 'กำลังบันทึกเข้า Google Drive โรงเรียน...' });
            const safeBookNumber = (newDoc.bookNumber || 'unknown').replace(/[\\\/ :*?"<>|]/g, '-');
            const uploadName = `${safeBookNumber}_${finalName}`;

            const uploadPayload = {
                folderId: sysConfig.driveFolderId.trim(),
                fileName: uploadName,
                mimeType: result.mimeType,
                fileData: result.mimeType === 'application/pdf' && docCategory === 'INCOMING' ? getCleanBase64(fileData) : result.fileData
            };

            const uploadResp = await fetch(sysConfig.scriptUrl.trim(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(uploadPayload),
                redirect: 'follow'
            });

            const uploadResponseText = await uploadResp.text();
            if (uploadResponseText.trim().startsWith('error:')) {
                const errMsg = uploadResponseText.trim().replace('error:', '').trim();
                if (errMsg.includes('DriveApp') || errMsg.includes('Permission')) {
                    throw new Error(`ไม่ได้รับอนุญาตให้เข้าถึง Google Drive (DriveApp Error)\n\nรายละเอียด: ${errMsg}\n\nวิธีแก้ไข:\n1. ไปที่เมนู "ตั้งค่าระบบ" ในแอปนี้\n2. คัดลอกโค้ดสคริปต์ใหม่ (v15.1)\n3. นำไปวางใน Google Apps Script แทนที่ของเดิม\n4. กด "เรียกใช้" ฟังก์ชัน A_RUN_ME_FIRST_initialSetup เพื่อให้สิทธิ์\n5. สำคัญมาก: กด "Deploy" -> "Manage Deployments" -> "Edit" -> เลือก Version เป็น "New Version" แล้วกด Deploy`);
                }
                throw new Error(errMsg);
            }

            let upResult;
            try {
                upResult = JSON.parse(uploadResponseText);
            } catch (e) {
                throw new Error("เซิร์ฟเวอร์ตอบกลับด้วยรูปแบบที่ไม่ถูกต้องระหว่างอัปโหลด: " + uploadResponseText.substring(0, 100));
            }
            if (upResult.status === 'success') {
                setTempAttachments(prev => [...prev, { id: `att_${Date.now()}`, name: uploadName, type: 'LINK', url: upResult.viewUrl || upResult.url, fileType: result.mimeType }]);
                updateTask(taskId, { status: 'done', message: 'ดึงไฟล์+จัดเก็บ สำเร็จ' });
            } else throw new Error(upResult.message || "Failed to save to Drive");

        } catch (err: any) {
            updateTask(taskId, { status: 'error', message: `ขัดข้อง: ${err.message}` });
        }
    };

    const handleFileUploadInBackground = async (file: File) => {
        const client = supabase;
        if (!sysConfig?.scriptUrl?.trim() || !sysConfig?.driveFolderId?.trim() || !client) {
            alert("ไม่พบการตั้งค่า Google Drive! กรุณาตรวจสอบการตั้งค่าในเมนูตั้งค่าระบบ");
            return;
        }

        const taskId = `upload_${Date.now()}`;
        const safeBookNumber = (newDoc.bookNumber || 'unknown').replace(/[\\\/ :*?"<>|]/g, '-');
        const finalFileName = `${safeBookNumber}_${file.name}`;

        setBackgroundTasks(prev => [...prev, { 
            id: taskId, 
            title: `อัปโหลด: ${file.name}`, 
            status: 'uploading', 
            message: 'กำลังเตรียมไฟล์...', 
            notified: false 
        }]);

        try {
            const reader = new FileReader();
            const base64DataPromise = new Promise<string>((resolve) => {
                reader.onload = async () => {
                    let data = reader.result as string;
                    if (file.type === 'application/pdf' && docCategory === 'INCOMING' && !isEditMode) {
                        updateTask(taskId, { message: 'กำลังประทับตราเลขรับ...' });
                        try {
                            data = await stampReceiveNumber({
                                fileBase64: data,
                                bookNumber: newDoc.bookNumber || "XXX/XXXX",
                                date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
                                time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
                                schoolName: currentSchool.name,
                                schoolLogoBase64: sysConfig.officialGarudaBase64,
                                proxyUrl: sysConfig.scriptUrl 
                            });
                        } catch (e) {
                            console.error("Stamping failed", e);
                        }
                    }
                    resolve(data);
                };
            });
            reader.readAsDataURL(file);
            const base64Data = await base64DataPromise;

            updateTask(taskId, { message: 'กำลังอัปโหลดไปที่ Google Drive...' });

            const payload = { 
                folderId: sysConfig.driveFolderId.trim(), 
                fileName: finalFileName, 
                mimeType: file.type, 
                fileData: getCleanBase64(base64Data) 
            }; 
            
            const response = await fetch(sysConfig.scriptUrl.trim(), { 
                method: 'POST', 
                body: JSON.stringify(payload), 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                redirect: 'follow' 
            }); 
            
            if (!response.ok) throw new Error("Cloud Storage Error");
            
            const responseText = await response.text();
            if (responseText.trim().startsWith('error:')) {
                const errMsg = responseText.trim().replace('error:', '').trim();
                if (errMsg.includes('DriveApp') || errMsg.includes('Permission')) {
                    throw new Error(`ไม่ได้รับอนุญาตให้เข้าถึง Google Drive (DriveApp Error)\n\nรายละเอียด: ${errMsg}\n\nวิธีแก้ไข:\n1. ไปที่เมนู "ตั้งค่าระบบ" ในแอปนี้\n2. คัดลอกโค้ดสคริปต์ใหม่ (v15.1)\n3. นำไปวางใน Google Apps Script แทนที่ของเดิม\n4. กด "เรียกใช้" ฟังก์ชัน A_RUN_ME_FIRST_initialSetup เพื่อให้สิทธิ์\n5. สำคัญมาก: กด "Deploy" -> "Manage Deployments" -> "Edit" -> เลือก Version เป็น "New Version" แล้วกด Deploy`);
                }
                throw new Error(errMsg);
            }

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                throw new Error("เซิร์ฟเวอร์ตอบกลับด้วยรูปแบบที่ไม่ถูกต้อง: " + responseText.substring(0, 100));
            }
            if (result.status === 'success') { 
                setTempAttachments(prev => [...prev, { id: `att_${Date.now()}`, name: finalFileName, type: 'LINK', url: result.viewUrl || result.url, fileType: file.type }]); 
                updateTask(taskId, { status: 'done', message: 'อัปโหลดสำเร็จ' });
            } else throw new Error(result.message); 
        } catch (err: any) {
            updateTask(taskId, { status: 'error', message: `อัปโหลดล้มเหลว: ${err.message}` });
        }
    };

    /**
     * Logic for creating a formal Memorandum command sheet
     */
    const processActionWithMemorandum = async (targetDoc: DocumentItem, finalCommand: string, targetTeacherIds: string[], nextStatus: any, viceId?: string) => {
        const taskId = targetDoc.id;
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        
        setBackgroundTasks(prev => [...prev, { 
            id: taskId, 
            title: `สร้างบันทึกข้อสั่งการ: ${targetDoc.title}`, 
            status: 'processing', 
            message: 'กำลังรวบรวมข้อมูล...', 
            notified: false 
        }]);

        if (!sysConfig?.scriptUrl?.trim() || !sysConfig?.driveFolderId?.trim()) {
            throw new Error("ไม่พบการตั้งค่า Google Drive! กรุณาตรวจสอบการตั้งค่าระบบ");
        }

        try {
            const isActorVice = targetDoc.status === 'PendingViceDirector' || (targetDoc.assignedViceDirectorId === currentUser.id);
            const isRealDirector = (currentUser.roles || []).includes('DIRECTOR');
            const signatureToUse = currentUser.signatureBase64 || (isRealDirector ? sysConfig?.directorSignatureBase64 : null);
            
            if (!signatureToUse) throw new Error("ไม่พบลายเซ็นดิจิทัล! กรุณาอัปโหลดลายเซ็นในเมนู 'ข้อมูลส่วนตัว' หรือติดต่อแอดมินเพื่อตรวจสอบลายเซ็นส่วนกลาง");

            updateTask(taskId, { message: 'กำลังสร้างบันทึกข้อความ (PDF)...' });

            let targetTeacherNames: string[] = [];
            if (targetTeacherIds.length > 0 && targetTeacherIds.length < teachersInSchool.length) {
                targetTeacherNames = targetTeacherIds.map(id => allTeachers.find(t => t.id === id)?.name || id);
            }

            const deptLabel = selectedOfficerDept ? ` (${selectedOfficerDept})` : (sysConfig?.officerDepartment ? ` (${sysConfig.officerDepartment})` : '');
            const schoolWithDept = `${currentSchool.name}${deptLabel}`;

            const directorPosition = currentUser.isActingDirector 
                ? 'รักษาการในตำแหน่งผู้อำนวยการโรงเรียน' 
                : ((currentUser.roles || []).includes('DIRECTOR') ? 'ผู้อำนวยการโรงเรียน' : currentUser.position);

            let pdfBase64 = '';
            
            if (finalCommand === "รับทราบแล้ว") {
                const officers = allTeachers.filter(t => t.schoolId === currentUser.schoolId && (t.roles || []).includes('DOCUMENT_OFFICER') && !(t.roles || []).includes('DIRECTOR'));
                const officer = officers[0] || { name: 'เจ้าหน้าที่ธุรการ', signatureBase64: null };
                
                pdfBase64 = await generateAcknowledgeMemoPdf({
                    schoolName: schoolWithDept,
                    schoolNameOnly: currentSchool.name,
                    bookNumber: targetDoc.bookNumber,
                    title: targetDoc.title,
                    from: targetDoc.from || '-',
                    details: targetDoc.description || '(ไม่มีข้อมูลรายละเอียด)',
                    officerName: officer.name,
                    officerSignatureBase64: officer.signatureBase64,
                    directorName: currentUser.name,
                    directorPosition: directorPosition,
                    directorSignatureBase64: signatureToUse,
                    officialGarudaBase64: sysConfig?.officialGarudaBase64,
                    signatureScale: sysConfig?.directorSignatureScale || 1.0,
                    signatureYOffset: sysConfig?.directorSignatureYOffset || 0,
                    proxyUrl: sysConfig?.scriptUrl
                });
            } else {
                pdfBase64 = await generateDirectorCommandMemoPdf({
                    schoolName: schoolWithDept,
                    bookNumber: targetDoc.bookNumber,
                    title: targetDoc.title,
                    from: targetDoc.from || '-',
                    details: targetDoc.description || '(ไม่มีข้อมูลรายละเอียด)',
                    command: finalCommand,
                    directorName: currentUser.name,
                    directorPosition: directorPosition,
                    signatureBase64: signatureToUse,
                    officialGarudaBase64: sysConfig?.officialGarudaBase64,
                    signatureScale: sysConfig?.directorSignatureScale || 1.0,
                    signatureYOffset: sysConfig?.directorSignatureYOffset || 0,
                    proxyUrl: sysConfig?.scriptUrl,
                    targetTeacherNames: targetTeacherNames 
                });
            }

            let signedUrl = null;
            if (pdfBase64 && sysConfig?.scriptUrl) {
                updateTask(taskId, { status: 'uploading', message: 'กำลังบันทึกไฟล์ลงคลาวด์...' });
                const safeBookNumber = targetDoc.bookNumber.replace(/[\\\/ :*?"<>|]/g, '-');
                const payload = { 
                    folderId: sysConfig.driveFolderId.trim(), 
                    fileName: `${safeBookNumber}_memo.pdf`, 
                    mimeType: 'application/pdf', 
                    fileData: getCleanBase64(pdfBase64) 
                };
                const upResp = await fetch(sysConfig.scriptUrl.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
                const upResponseText = await upResp.text();
                if (upResponseText.trim().startsWith('error:')) {
                    const errMsg = upResponseText.trim().replace('error:', '').trim();
                    if (errMsg.includes('DriveApp') || errMsg.includes('Permission')) {
                        throw new Error(`ไม่ได้รับอนุญาตให้เข้าถึง Google Drive (DriveApp Error)\n\nรายละเอียด: ${errMsg}\n\nวิธีแก้ไข:\n1. ไปที่เมนู "ตั้งค่าระบบ" ในแอปนี้\n2. คัดลอกโค้ดสคริปต์ใหม่ (v15.1)\n3. นำไปวางใน Google Apps Script แทนที่ของเดิม\n4. กด "เรียกใช้" ฟังก์ชัน A_RUN_ME_FIRST_initialSetup เพื่อให้สิทธิ์\n5. สำคัญมาก: กด "Deploy" -> "Manage Deployments" -> "Edit" -> เลือก Version เป็น "New Version" แล้วกด Deploy`);
                    }
                    throw new Error(errMsg);
                }

                let upRes;
                try {
                    upRes = JSON.parse(upResponseText);
                } catch (e) {
                    throw new Error("เซิร์ฟเวอร์ตอบกลับด้วยรูปแบบที่ไม่ถูกต้องระหว่างบันทึกไฟล์: " + upResponseText.substring(0, 100));
                }
                if (upRes.status === 'success') signedUrl = upRes.viewUrl || upRes.url;
            }

            const nowStr = new Date().toLocaleString('th-TH');
            const updateData: any = { status: nextStatus };
            if (signedUrl) updateData.signed_file_url = signedUrl;
            
            if (isActorVice) { 
                updateData.vice_director_command = finalCommand; 
                updateData.vice_director_signature_date = nowStr; 
                updateData.target_teachers = targetTeacherIds; 
            } else { 
                updateData.director_command = finalCommand; 
                updateData.director_signature_date = nowStr; 
                // ล้างค่า assigned_vice_director_id เมื่อส่งต่อหรือสั่งปฏิบัติเรียบร้อยแล้ว
                if (nextStatus === 'PendingViceDirector') {
                    updateData.assigned_vice_director_id = viceId; 
                } else {
                    updateData.assigned_vice_director_id = null;
                    updateData.target_teachers = targetTeacherIds; 
                }
            }

            const { error } = await client.from('documents').update(updateData).eq('id', taskId);
            if (error) throw error;

            const notifyAtts = [...targetDoc.attachments];
            if (signedUrl) notifyAtts.unshift({ id: 'signed', name: 'บันทึกข้อสั่งการ (ศธ.)', type: 'LINK', url: signedUrl });

            // แจ้งเตือนผู้รับมอบหมาย
            const notifyIds = nextStatus === 'PendingViceDirector' ? [] : targetTeacherIds;
            if (notifyIds.length > 0) {
                const notifyList = allTeachers.filter(t => notifyIds.includes(t.id) && !(t.roles || []).includes('DIRECTOR'));
                if (notifyList.length > 0) {
                    triggerTelegramNotification(notifyList, taskId, targetDoc.title, targetDoc.bookNumber, false, currentSchool.name, notifyAtts, undefined, targetDoc.priority);
                }
            }

            // แจ้งเตือนเจ้าหน้าที่ธุรการ
            const officers = allTeachers.filter(t => t.schoolId === currentUser.schoolId && (t.roles || []).includes('DOCUMENT_OFFICER') && !(t.roles || []).includes('DIRECTOR'));
            if (officers.length > 0) {
                triggerTelegramNotification(officers, taskId, targetDoc.title, targetDoc.bookNumber, false, directorPosition, notifyAtts, `✅ ${directorPosition} เกษียณหนังสือเรียบร้อยแล้ว`, targetDoc.priority);
            }

            updateTask(taskId, { status: 'done', message: 'สร้างบันทึกข้อความสั่งการเรียบร้อย' }); 
            fetchDocs();
        } catch (e: any) { updateTask(taskId, { status: 'error', message: `ล้มเหลว: ${e.message}` }); }
    };

    const handleQuickDelegateToVice = async () => {
        const client = supabase;
        if (!selectedDoc || !assignedViceDirId || !client) return;
        const taskId = selectedDoc.id;
        const vice = allTeachers.find(t => t.id === assignedViceDirId);
        const finalCommand = command || `มอบ ${vice?.name} พิจารณาดำเนินการ`;
        
        setBackgroundTasks(prev => [...prev, { id: taskId, title: selectedDoc.title, status: 'processing', message: 'กำลังส่งต่อ...', notified: false }]);
        setViewMode('LIST');

        try {
            const nowStr = new Date().toLocaleString('th-TH');
            const { error } = await client.from('documents').update({ status: 'PendingViceDirector', assigned_vice_director_id: assignedViceDirId, director_command: finalCommand, director_signature_date: nowStr }).eq('id', taskId);
            if (error) throw error;
            
            if (vice && !(vice.roles || []).includes('DIRECTOR')) {
                triggerTelegramNotification([vice], taskId, selectedDoc.title, selectedDoc.bookNumber, false, currentSchool.name, selectedDoc.attachments, undefined, selectedDoc.priority);
            }
            
            const officers = allTeachers.filter(t => t.schoolId === currentUser.schoolId && (t.roles || []).includes('DOCUMENT_OFFICER') && !(t.roles || []).includes('DIRECTOR'));
            if (officers.length > 0) {
                triggerTelegramNotification(officers, taskId, selectedDoc.title, selectedDoc.bookNumber, false, currentSchool.name, selectedDoc.attachments, "✅ ผอ. มอบหมายรองผู้อำนวยการดำเนินการแล้ว", selectedDoc.priority);
            }

            updateTask(taskId, { status: 'done', message: 'มอบหมายสำเร็จ' });
            fetchDocs();
        } catch (e: any) { updateTask(taskId, { status: 'error', message: `ล้มเหลว: ${e.message}` }); }
    };

    const handleDirectorAction = (isNotifyOnly: boolean) => {
        if (!selectedDoc) return;
        
        let finalCommand = command;
        let finalTeachers = selectedTeachers;
        
        if (isNotifyOnly) {
            // กรณีแจ้งเวียนเพื่อทราบ: ให้ส่งหาทุกคนและใช้ข้อความมาตรฐานตามที่ผู้ใช้กำหนด
            finalCommand = "เพื่อแจ้งให้คณะครูและบุคลากรทางการศึกษาทุกท่านทราบ ตามรายละเอียดที่แจ้งมาพร้อมนี้";
            finalTeachers = teachersInSchool.map(t => t.id);
        }
        
        processActionWithMemorandum(selectedDoc, finalCommand, finalTeachers, 'Distributed', assignedViceDirId);
        setViewMode('LIST');
    };

    const handleDirectorAcknowledge = async () => {
        if (!selectedDoc) return;
        
        // ใช้ processActionWithMemorandum เพื่อสร้างบันทึกข้อความ "รับทราบแล้ว"
        // โดยไม่ส่งหาครูคนไหน (targetTeacherIds = []) แต่ยังแจ้งเตือนธุรการตามปกติ
        processActionWithMemorandum(selectedDoc, "รับทราบแล้ว", [], 'Distributed');
        setViewMode('LIST');
    };


    const handleViceDirectorAction = () => {
        if (!selectedDoc) return;
        processActionWithMemorandum(selectedDoc, command, selectedTeachers, 'Distributed');
        setViewMode('LIST');
    };

    const handleOpenAndAck = (docItem: DocumentItem, url: string) => {
        if (!url) return; 
        const viewUrl = getPreviewUrl(url);
        window.open(viewUrl, '_blank');
        handleTeacherAcknowledge(docItem.id, docItem.acknowledgedBy || []);
    };

    const startEditDoc = (docItem: DocumentItem) => {
        setNewDoc({ 
            id: docItem.id, 
            bookNumber: docItem.bookNumber, 
            title: docItem.title, 
            from: docItem.from, 
            priority: docItem.priority, 
            description: docItem.description 
        });
        setDocCategory(docItem.category || 'INCOMING');
        setTempAttachments(docItem.attachments || []);
        setSelectedTeachers(docItem.targetTeachers || []);
        setIsEditMode(true);
        setViewMode('CREATE');
    };

    // --- Effects & Lifecycle ---

    useEffect(() => {
        const client = supabase;
        const loadInitial = async () => {
            setIsLoading(true);
            await fetchDocs();
            if (isSupabaseConfigured && client) {
                const { data: configData } = await client.from('school_configs').select('*').eq('school_id', currentUser.schoolId).maybeSingle();
                if (configData) {
                    const agencies = configData.external_agencies || [];
                    const depts = configData.internal_departments || [];
                    setSysConfig({
                        driveFolderId: configData.drive_folder_id || '',
                        scriptUrl: configData.script_url || '',
                        telegramBotToken: configData.telegram_bot_token || '',
                        appBaseUrl: configData.app_base_url || '',
                        officialGarudaBase64: configData.official_garuda_base_64,
                        officerDepartment: configData.officer_department || '',
                        internalDepartments: depts,
                        externalAgencies: agencies,
                        directorSignatureBase64: configData.director_signature_base_64,
                        directorSignatureScale: configData.director_signature_scale || 1.0,
                        directorSignatureYOffset: configData.director_signature_y_offset || 0,
                        schoolName: currentSchool.name 
                    });
                    if (depts.length > 0) setSelectedOfficerDept(depts[0]);
                }
            }
        };
        loadInitial();
        
        let channel: any;
        if (isSupabaseConfigured && client) {
            channel = client.channel('documents_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `school_id=eq.${currentUser.schoolId}` }, () => { fetchDocs(); }).subscribe();
        }
        return () => { if (channel && client) client.removeChannel(channel); };
    }, [currentUser.schoolId, currentSchool.name]);

    useEffect(() => {
        setCommand('');
        setSelectedTeachers([]);
        setStampPage(1);
        setAssignedViceDirId('');
        setTeacherSearchTerm('');
    }, [selectedDoc?.id, viewMode]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeTab]);

    useEffect(() => {
        const newlyDoneTask = backgroundTasks.find(t => t.status === 'done' && !t.notified);
        if (newlyDoneTask) {
            updateTask(newlyDoneTask.id, { notified: true });
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.volume = 0.3;
                audio.play().catch(e => {});
            } catch(e) {}
            autoRemoveDoneTask(newlyDoneTask.id);
            fetchDocs();
        }
    }, [backgroundTasks]);

    useEffect(() => {
        if (focusDocId && docs.length > 0) {
            const found = docs.find(d => d.id === focusDocId);
            if (found) {
                setSelectedDoc(found);
                setViewMode('DETAIL');
                
                const isDistributed = found.status === 'Distributed' || found.status === 'PendingViceDirector';
                const isTarget = (found.targetTeachers || []).includes(currentUser.id) || (found.assignedViceDirectorId === currentUser.id);
                const notAckedYet = !(found.acknowledgedBy || []).includes(currentUser.id);

                if (isDistributed && isTarget && notAckedYet) {
                    handleTeacherAcknowledge(found.id, found.acknowledgedBy || []);
                }

                const params = new URLSearchParams(window.location.search);
                const directFileUrl = params.get('file');
                if (directFileUrl) {
                    const viewUrl = getPreviewUrl(directFileUrl);
                    window.open(viewUrl, '_blank');
                }
                
                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusDocId, docs, currentUser.id]);

    // --- Rendering Helpers ---

    const filteredDocs = docs.filter(doc => {
        let isVisible = false;
        if (isDirector || isDocOfficer || isSystemAdmin) isVisible = true;
        else if (isViceDirector || (doc.assignedViceDirectorId === currentUser.id)) isVisible = (doc.status === 'PendingViceDirector' && doc.assignedViceDirectorId === currentUser.id) || (doc.status === 'Distributed' && (doc.targetTeachers || []).includes(currentUser.id));
        else isVisible = doc.status === 'Distributed' && (doc.targetTeachers || []).includes(currentUser.id);

        if (!isVisible) return false;
        if (activeTab === 'INCOMING' && doc.category !== 'INCOMING') return false;
        if (activeTab === 'ORDER' && doc.category !== 'ORDER') return false;
        if (activeTab === 'OUTGOING' && doc.category !== 'OUTGOING') return false;
        if (activeTab === 'PENDING' && doc.status !== 'PendingDirector') return false;
        if (activeTab === 'UNREAD') {
            const isDistributed = doc.status === 'Distributed';
            const isTarget = (doc.targetTeachers || []).includes(currentUser.id);
            const isNotAcknowledged = !(doc.acknowledgedBy || []).includes(currentUser.id);
            if (!isDistributed || !isTarget || !isNotAcknowledged) return false;
        }

        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return doc.title.toLowerCase().includes(s) || doc.bookNumber.toLowerCase().includes(s) || doc.from.toLowerCase().includes(s);
    });

    const totalPages = Math.ceil(filteredDocs.length / ITEMS_PER_PAGE);
    const displayedDocs = filteredDocs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const TeacherSelectionGrid = ({ selectedIds, onToggle, currentSearch, onSearchChange }: any) => {
        const filtered = teachersInSchool.filter(t => t.name.toLowerCase().includes(currentSearch.toLowerCase()) || t.position.toLowerCase().includes(currentSearch.toLowerCase()));
        return (
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                        <input type="text" placeholder="ค้นชื่อครู..." value={currentSearch} onChange={(e) => onSearchChange(e.target.value)} className="w-full pl-10 pr-4 py-2 text-sm border-2 border-slate-400 rounded-xl outline-none font-bold shadow-sm"/>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button type="button" onClick={() => onToggle(teachersInSchool.map(t => t.id))} className="flex-1 md:flex-none px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold border-2 border-blue-200 hover:bg-blue-100 transition-all">เลือกทั้งหมด</button>
                        <button type="button" onClick={() => onToggle([])} className="flex-1 md:flex-none px-3 py-2 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold border-2 border-slate-300 hover:bg-slate-100 transition-all">ล้าง</button>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
                    {filtered.map(t => {
                        const isSelected = selectedIds.includes(t.id);
                        return (
                            <button key={t.id} type="button" onClick={() => onToggle(isSelected ? selectedIds.filter((id:any) => id !== t.id) : [...selectedIds, t.id])} className={`p-3 rounded-xl border-2 text-left transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400'}`}>
                                <div className="font-bold text-xs truncate">{t.name}</div>
                                <div className={`text-[9px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>{t.position}</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-4"><Loader className="animate-spin text-blue-600" size={32}/><p className="font-bold">กำลังเชื่อมต่อระบบฐานข้อมูล SQL...</p></div>;

    // --- MAIN COMPONENT JSX ---

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {/* Background Tasks Notification Overlay */}
            {backgroundTasks.length > 0 && (
                <div className="fixed bottom-20 right-6 z-[60] w-72 flex flex-col gap-2 pointer-events-none">
                    {backgroundTasks.map(task => (
                        <div key={task.id} className={`p-3 rounded-xl shadow-2xl border flex flex-col gap-2 animate-slide-up pointer-events-auto transition-all ${task.status === 'done' ? 'bg-emerald-50 border-emerald-200' : task.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {task.status === 'done' ? <CheckCircle className="text-emerald-600 shrink-0" size={16}/> : task.status === 'error' ? <AlertTriangle className="text-red-600 shrink-0" size={16}/> : <Loader className="animate-spin text-blue-600 shrink-0" size={16}/>}
                                    <span className="text-xs font-bold text-slate-700 truncate">{task.title}</span>
                                </div>
                                {(task.status === 'error' || task.status === 'done') && (
                                    <button type="button" onClick={() => removeTask(task.id)} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={14}/></button>
                                )}
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-500 ${task.status === 'done' ? 'bg-emerald-500 w-full' : task.status === 'error' ? 'bg-red-500 w-full' : task.status === 'uploading' ? 'bg-orange-500 w-2/3' : 'bg-blue-500 w-1/3'}`}></div>
                            </div>
                            <p className={`text-[10px] ${task.status === 'error' ? 'text-red-600 font-bold' : (task.status === 'done' ? 'text-emerald-600' : (task.status === 'uploading' ? 'text-orange-600' : 'text-slate-500'))}`}>{task.message}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Header / Banner Area */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-800 text-white p-4 rounded-xl shadow-lg border-b-4 border-slate-700 overflow-hidden relative group">
                <div className="flex-1 relative z-10">
                    <h2 className="text-xl font-bold tracking-tight">ระบบงานสารบรรณโรงเรียน</h2>
                    <p className="text-slate-400 text-xs mt-1">ผู้ใช้งาน: <span className="font-bold text-yellow-400">{currentUser.name}</span></p>
                </div>
                <div className="flex items-center gap-3 relative z-10">
                    {(isDirector || isDocOfficer || isSystemAdmin) && pendingDirectorCount > 0 && (
                        <button 
                            onClick={() => { setActiveTab('PENDING'); setViewMode('LIST'); }}
                            className="bg-orange-600 hover:bg-orange-500 p-2 px-4 rounded-xl text-xs font-black flex items-center gap-2 border border-orange-400 shadow-lg animate-pulse transition-all relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shimmer pointer-events-none"></div>
                            <Zap size={16} className="relative z-10"/> 
                            <span className="relative z-10">{isDirector ? 'มีหนังสือรอเกษียณ' : 'หนังสือรอ ผอ. เกษียณ'} ({pendingDirectorCount})</span>
                        </button>
                    )}
                    {!isDirector && unreadDocCount > 0 && (
                        <button 
                            onClick={() => { setActiveTab('UNREAD'); setViewMode('LIST'); }}
                            className="bg-orange-600 hover:bg-orange-500 p-2 px-4 rounded-xl text-xs font-black flex items-center gap-2 border border-orange-400 shadow-lg animate-pulse transition-all relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shimmer pointer-events-none"></div>
                            <Zap size={16} className="relative z-10"/> 
                            <span className="relative z-10">หนังสือยังไม่อ่าน ({unreadDocCount})</span>
                        </button>
                    )}
                    {isSystemAdmin && (
                        <button 
                            onClick={() => setShowAgencyManager(true)}
                            className="bg-slate-700 hover:bg-slate-600 p-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-600 transition-all"
                        >
                            <Globe size={16}/> จัดการรายชื่อหน่วยงานต้นเรื่อง
                        </button>
                    )}
                    <button onClick={() => setShowTaskQueue(!showTaskQueue)} className={`p-2 rounded-full transition-all relative ${activeTasks.length > 0 ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <Bell size={20}/>
                        {(activeTasks.length > 0 || doneTasksCount > 0) && (
                            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full border-2 border-slate-800 bg-blue-500 text-white">{activeTasks.length || doneTasksCount}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Agency Manager Modal */}
            {showAgencyManager && (
                <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black flex items-center gap-3"><Globe size={24} className="text-blue-400"/> รายชื่อหน่วยงานต้นเรื่อง</h3>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">External Agencies Manager</p>
                            </div>
                            <button onClick={() => setShowAgencyManager(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
                        </div>
                        <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                            <div className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-100 flex gap-3 items-center">
                                <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md shadow-inner"><Info size={20}/></div>
                                <p className="text-xs font-bold text-blue-700 leading-relaxed">บันทึกชื่อหน่วยงานภายนอกที่ส่งหนังสือมาบ่อยๆ เพื่อให้สะดวกต่อการเลือกในหน้าลงทะเบียนหนังสือ</p>
                            </div>

                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="ระบุชื่อหน่วยงาน... (เช่น สพฐ., สพป.บร.2)" 
                                    value={newAgencyInput}
                                    onChange={e => setNewAgencyInput(e.target.value)}
                                    className="flex-1 px-4 py-3 border-2 border-slate-100 rounded-xl outline-none focus:border-blue-600 font-bold shadow-inner"
                                    onKeyPress={e => e.key === 'Enter' && handleAddExternalAgency()}
                                />
                                <button onClick={handleAddExternalAgency} className="bg-blue-600 text-white px-5 rounded-xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"><Plus size={24}/></button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">หน่วยงานที่บันทึกไว้</label>
                                {sysConfig?.externalAgencies && sysConfig.externalAgencies.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-2">
                                        {sysConfig.externalAgencies.map((agency, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 border rounded-2xl group hover:bg-white hover:border-blue-200 transition-all">
                                                <span className="font-bold text-slate-700">{agency}</span>
                                                <button onClick={() => handleRemoveExternalAgency(agency)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-2xl text-slate-300 font-bold italic">ยังไม่ได้เพิ่มหน่วยงานต้นเรื่อง</div>
                                )}
                            </div>
                        </div>
                        <div className="p-8 border-t bg-slate-50 text-right">
                            <button onClick={() => setShowAgencyManager(false)} className="px-10 py-3 bg-slate-900 text-white rounded-xl font-black shadow-lg transition-all active:scale-95">เสร็จสิ้น</button>
                        </div>
                    </div>
                </div>
            )}

            {/* LIST VIEW */}
            {viewMode === 'LIST' && (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6">
                        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100 w-full md:w-auto">
                            <button onClick={() => setActiveTab('ALL')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'ALL' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>ทั้งหมด</button>
                            <button onClick={() => setActiveTab('INCOMING')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'INCOMING' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>หนังสือรับ</button>
                            <button onClick={() => setActiveTab('ORDER')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'ORDER' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>คำสั่งโรงเรียน</button>
                            {(isDirector || isDocOfficer || isSystemAdmin) && (
                                <button onClick={() => setActiveTab('OUTGOING')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'OUTGOING' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>หนังสือส่ง</button>
                            )}
                            {isDirector || isDocOfficer || isSystemAdmin ? (
                                <button onClick={() => setActiveTab('PENDING')} className={`relative px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'PENDING' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
                                    รอเกษียณ
                                    {pendingDirectorCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white ring-2 ring-white animate-bounce">
                                            {pendingDirectorCount}
                                        </span>
                                    )}
                                </button>
                            ) : (
                                <button onClick={() => setActiveTab('UNREAD')} className={`relative px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'UNREAD' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
                                    หนังสือยังไม่อ่าน
                                    {unreadDocCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white ring-2 ring-white animate-bounce">
                                            {unreadDocCount}
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col md:flex-row flex-1 justify-end items-center gap-3 w-full">
                            <div className="relative flex-1 w-full md:max-w-md group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
                                <input type="text" placeholder="ค้นหาเรื่อง, เลขที่, หน่วยงาน..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-slate-400 outline-none focus:ring-4 ring-blue-50 transition-all font-bold text-sm" />
                            </div>
                            {(isDocOfficer || isSystemAdmin) && (
                                <button onClick={() => { 
                                    setIsEditMode(false);
                                    const currentThaiYear = String(new Date().getFullYear() + 543);
                                    let maxNum = 0;
                                    docs.forEach(d => {
                                        const parts = d.bookNumber.split('/');
                                        if (parts.length === 2 && parts[1].trim() === currentThaiYear) {
                                            const num = parseInt(parts[0].trim());
                                            if (!isNaN(num) && num > maxNum) maxNum = num;
                                        }
                                    });
                                    setNewDoc({ 
                                        id: '',
                                        bookNumber: `${String(maxNum + 1).padStart(3, '0')}/${currentThaiYear}`, 
                                        title: '', 
                                        from: '', 
                                        priority: 'Normal', 
                                        description: '' 
                                    });
                                    setDocCategory('INCOMING'); 
                                    setTempAttachments([]); 
                                    setViewMode('CREATE'); 
                                }} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl shadow-lg flex items-center gap-2 font-black transition-all hover:scale-105 active:scale-95 w-full md:w-auto justify-center text-sm">
                                    <FilePlus size={16} /> ลงรับ/สร้างหนังสือ
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        {displayedDocs.map(docItem => (
                            <div key={docItem.id} className="group bg-white p-4 md:p-5 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden flex flex-col md:flex-row md:items-center gap-4 md:gap-6 border-slate-50 hover:border-blue-200 hover:shadow-md" onClick={() => { setSelectedDoc(docItem); setViewMode('DETAIL'); }}>
                                <div className="flex items-center gap-4 md:gap-6 flex-1 min-w-0">
                                    <div className={`p-4 md:p-5 rounded-2xl shrink-0 transition-all group-hover:scale-125 shadow-lg group-hover:shadow-2xl border-2 border-white ring-4 ${
                                        docItem.category === 'ORDER' 
                                            ? 'bg-gradient-to-br from-emerald-400 to-teal-700 text-white ring-emerald-50' 
                                            : docItem.status === 'PendingDirector'
                                                ? 'bg-gradient-to-br from-orange-400 to-red-700 text-white ring-orange-50'
                                                : docItem.status === 'Distributed'
                                                    ? 'bg-gradient-to-br from-blue-400 to-indigo-700 text-white ring-blue-50'
                                                    : 'bg-gradient-to-br from-slate-400 to-slate-700 text-white ring-slate-50'
                                    }`}>
                                        {docItem.category === 'ORDER' ? <Megaphone size={24}/> : <FileText size={24}/>}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[9px] md:text-[10px] font-black font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">{docItem.bookNumber}</span>
                                            <span className={`px-2 py-0.5 rounded text-[8px] md:text-[9px] font-black uppercase tracking-widest ${docItem.priority === 'Critical' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-50 text-slate-400 border'}`}>{docItem.priority === 'Normal' ? 'ปกติ' : docItem.priority === 'Urgent' ? 'ด่วน' : 'ด่วนที่สุด'}</span>
                                            {docItem.targetTeachers && docItem.targetTeachers.length > 0 && (
                                                <span className={`text-[8px] md:text-[9px] px-2 py-0.5 rounded-full font-black border flex items-center gap-1 shadow-sm transition-all ${docItem.acknowledgedBy?.includes(currentUser.id) ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    <Users size={10}/> {docItem.acknowledgedBy?.length || 0} / {docItem.targetTeachers.length} รับทราบ
                                                </span>
                                            )}
                                            {/* ผอ. เกษียณแล้ว Badge */}
                                            {isDocOfficer && docItem.directorCommand && docItem.status !== 'PendingDirector' && (
                                                <span className="bg-purple-100 text-purple-700 text-[8px] md:text-[9px] px-2 py-0.5 rounded-full font-black border border-purple-200 flex items-center gap-1 shadow-sm">
                                                    <CheckCircle size={10} /> ผอ. เกษียณแล้ว
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-base md:text-lg text-slate-800 leading-tight group-hover:text-blue-600 transition-colors break-words">{docItem.title}</h3>
                                        <div className="flex flex-wrap items-center gap-x-4 md:gap-x-6 gap-y-1 text-[10px] md:text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                                            <span className="flex items-center gap-1.5">
                                                <History size={10}/> 
                                                {docItem.category === 'OUTGOING' ? 'ส่งถึง: ' : 'จาก: '} 
                                                {docItem.from}
                                            </span>
                                            <span className="flex items-center gap-1.5"><Clock size={10}/> {docItem.date}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-between md:justify-end md:items-end md:flex-col items-center gap-1 pt-2 md:pt-0 border-t md:border-none border-slate-50">
                                    <div className="flex gap-2 items-center">
                                        {canManageDoc && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); startEditDoc(docItem); }}
                                                className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                title="แก้ไขข้อมูล"
                                            >
                                                <Edit3 size={16}/>
                                            </button>
                                        )}
                                        {canManageDoc && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteDoc(docItem.id); }}
                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all mr-1"
                                                title="ลบหนังสือ"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        )}
                                        {docItem.status === 'PendingDirector' && (
                                            <span className="text-[10px] md:text-sm font-black text-white uppercase bg-orange-600 px-4 py-1.5 rounded-full shadow-md animate-pulse border-2 border-white ring-2 ring-orange-100">
                                                รอ ผอ. สั่งการ
                                            </span>
                                        )}
                                        {!isDirector && docItem.status === 'Distributed' && (docItem.targetTeachers || []).includes(currentUser.id) && !(docItem.acknowledgedBy || []).includes(currentUser.id) && (
                                            <span className="text-[10px] md:text-sm font-black text-white uppercase bg-red-600 px-4 py-1.5 rounded-full shadow-md animate-pulse border-2 border-white ring-2 ring-red-100">
                                                ยังไม่อ่าน
                                            </span>
                                        )}
                                        {/* Fix: Hide "Waiting for Vice" if no actual delegate assigned */}
                                        {docItem.status === 'PendingViceDirector' && docItem.assignedViceDirectorId && (
                                            <span className="text-[8px] md:text-[9px] font-black text-blue-500 uppercase bg-blue-50 px-2 py-0.5 rounded">
                                                รอรองฯ สั่งการ
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 transition-all">
                                        <ChevronRight size={16}/>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {displayedDocs.length === 0 && (
                            <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-100 text-slate-300 font-bold italic">ไม่พบข้อมูลหนังสือราชการ</div>
                        )}
                    </div>

                    {/* Pagination Buttons */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-8 py-4 bg-white rounded-2xl shadow-sm border border-slate-100 animate-fade-in">
                            <button 
                                onClick={() => setCurrentPage(1)} 
                                disabled={currentPage === 1}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                title="หน้าแรก"
                            >
                                <ChevronsLeft size={20}/>
                            </button>
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                disabled={currentPage === 1}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                title="หน้าก่อนหน้า"
                            >
                                <ChevronLeft size={20}/>
                            </button>
                            
                            <div className="flex items-center px-4 gap-2">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">หน้า</span>
                                <span className="bg-blue-50 text-blue-700 px-4 py-1 rounded-full text-sm font-black border border-blue-100 shadow-inner">
                                    {currentPage}
                                </span>
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">จาก {totalPages}</span>
                            </div>

                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                title="หน้าถัดไป"
                            >
                                <ChevronRight size={20}/>
                            </button>
                            <button 
                                onClick={() => setCurrentPage(totalPages)} 
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                title="หน้าสุดท้าย"
                            >
                                <ChevronsRight size={20}/>
                            </button>
                        </div>
                    )}
                </>
            )}

            {viewMode === 'CREATE' && (
                <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl border border-slate-100 p-6 md:p-10 max-w-5xl mx-auto relative overflow-hidden animate-slide-up">
                    <div className="mb-6 md:mb-10 border-b pb-6 md:pb-8 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div>
                            <h3 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-4">{isEditMode ? <Edit3 className="text-blue-700" size={24}/> : <FilePlus className="text-blue-700" size={24}/>} {isEditMode ? 'แก้ไขข้อมูลหนังสือ' : 'ลงทะเบียนหนังสือ / สร้างคำสั่ง'}</h3>
                            <p className="text-slate-400 font-bold text-[10px] mt-1 uppercase tracking-widest">ระบบจดทะเบียนและลงรับหนังสือราชการ</p>
                        </div>
                        {!isEditMode && (
                            <div className="bg-slate-100 p-1 rounded-xl md:rounded-2xl flex shadow-inner w-full md:w-auto">
                                <button type="button" onClick={() => setDocCategory('INCOMING')} className={`flex-1 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-black transition-all ${docCategory === 'INCOMING' ? 'bg-white text-blue-700 shadow-md' : 'text-slate-600'}`}>หนังสือรับ</button>
                                <button type="button" onClick={() => setDocCategory('ORDER')} className={`flex-1 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-black transition-all ${docCategory === 'ORDER' ? 'bg-emerald-700 text-white shadow-md' : 'text-slate-600'}`}>ประกาศ/คำสั่ง</button>
                                <button type="button" onClick={() => {
                                    setDocCategory('OUTGOING');
                                    if (!isEditMode && currentSchool.outgoingBookPrefix) {
                                        setNewDoc(prev => ({ ...prev, bookNumber: currentSchool.outgoingBookPrefix + ' ' }));
                                    }
                                }} className={`flex-1 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-xs md:text-sm font-black transition-all ${docCategory === 'OUTGOING' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-600'}`}>หนังสือส่ง</button>
                            </div>
                        )}
                        {isEditMode && (
                            <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-black text-xs border border-blue-100 uppercase tracking-widest">Edit Mode</div>
                        )}
                    </div>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const client = supabase;
                        if (!client) return;
                        setIsSavingForm(true);
                        const now = new Date();
                        
                        try {
                            if (isEditMode && newDoc.id) {
                                const payload: any = { 
                                    book_number: newDoc.bookNumber, 
                                    title: newDoc.title, 
                                    description: newDoc.description, 
                                    from: docCategory === 'ORDER' ? currentSchool.name : newDoc.from, 
                                    priority: newDoc.priority, 
                                    attachments: tempAttachments, 
                                };
                                if (docCategory === 'ORDER') {
                                    payload.target_teachers = selectedTeachers;
                                }

                                const { error } = await client.from('documents').update(payload).eq('id', newDoc.id);
                                if (error) throw error;
                                alert("แก้ไขข้อมูลเรียบร้อยแล้ว");
                            } else {
                                const created: any = { 
                                    schoolId: currentUser.schoolId, 
                                    category: docCategory, 
                                    bookNumber: newDoc.bookNumber, 
                                    title: newDoc.title, 
                                    description: newDoc.description, 
                                    from: docCategory === 'ORDER' ? currentSchool.name : newDoc.from, 
                                    date: now.toISOString().split('T')[0], 
                                    timestamp: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), 
                                    priority: newDoc.priority, 
                                    attachments: tempAttachments, 
                                    status: (docCategory === 'ORDER' || docCategory === 'OUTGOING') ? 'Distributed' : 'PendingDirector', 
                                    targetTeachers: docCategory === 'ORDER' ? selectedTeachers : [], 
                                    acknowledgedBy: [], 
                                    directorCommand: (docCategory === 'ORDER' || docCategory === 'OUTGOING') ? 'สั่งการตามเอกสารแนบ' : '', 
                                    directorSignatureDate: (docCategory === 'ORDER' || docCategory === 'OUTGOING') ? now.toLocaleString('th-TH') : '' 
                                };
                                const { data, error } = await client.from('documents').insert([mapDocToDb(created)]).select();
                                if (error) throw error;
                                if (data) { 
                                    const savedId = data[0].id.toString();
                                    if (docCategory === 'ORDER' && selectedTeachers.length > 0) {
                                        triggerTelegramNotification(allTeachers.filter(t => selectedTeachers.includes(t.id)), savedId, created.title, created.bookNumber, true, currentSchool.name, tempAttachments, undefined, created.priority);
                                    } else if (docCategory === 'INCOMING') {
                                        const directors = allTeachers.filter(t => t.schoolId === currentUser.schoolId && (t.roles || []).includes('DIRECTOR'));
                                        if (directors.length > 0) triggerTelegramNotification(directors, savedId, created.title, created.bookNumber, false, created.from, tempAttachments, undefined, created.priority);
                                    }
                                    // No notification for OUTGOING as requested
                                }
                            }
                            setViewMode('LIST'); fetchDocs(); 
                        } catch (err: any) {
                            alert("ล้มเหลว: " + err.message);
                        } finally {
                            setIsSavingForm(false);
                        }
                    }} className="space-y-6 md:space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                            <div className="space-y-4 md:space-y-6">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">เลขที่หนังสือ / รับที่ (Auto-Numbered)</label>
                                    <input required placeholder="ว 000/0000" value={newDoc.bookNumber} onChange={e => setNewDoc({...newDoc, bookNumber: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 border-2 border-slate-200 rounded-xl md:rounded-2xl font-black text-base md:text-lg outline-none focus:border-blue-600 transition-all" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">เรื่อง (ชื่อหนังสือ)</label>
                                    <input required placeholder="ระบุหัวข้อเรื่อง..." value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 border-2 border-slate-200 rounded-xl md:rounded-2xl font-black text-sm md:text-base outline-none focus:border-blue-600 transition-all" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                                            {docCategory === 'OUTGOING' ? 'ส่งถึง (หน่วยงานปลายทาง)' : 'จาก (หน่วยงานต้นเรื่อง)'}
                                        </label>
                                        {docCategory === 'INCOMING' ? (
                                            <select 
                                                required 
                                                value={newDoc.from} 
                                                onChange={e => setNewDoc({...newDoc, from: e.target.value})} 
                                                className="w-full px-4 md:px-5 py-3 border-2 border-slate-200 rounded-xl md:rounded-2xl font-bold text-sm outline-none focus:border-blue-600 transition-all appearance-none bg-white"
                                            >
                                                <option value="">-- เลือกหน่วยงาน --</option>
                                                {sysConfig?.externalAgencies?.map((agency, i) => (
                                                    <option key={i} value={agency}>{agency}</option>
                                                ))}
                                                <option value="อื่นๆ">อื่นๆ (ระบุในรายละเอียด)</option>
                                            </select>
                                        ) : docCategory === 'OUTGOING' ? (
                                            <>
                                                <input 
                                                    required 
                                                    placeholder="ระบุหน่วยงานผู้รับ..." 
                                                    list="externalAgencies"
                                                    value={newDoc.from} 
                                                    onChange={e => setNewDoc({...newDoc, from: e.target.value})} 
                                                    className="w-full px-4 md:px-5 py-3 border-2 border-slate-200 rounded-xl md:rounded-2xl font-bold text-sm outline-none focus:border-blue-600 transition-all" 
                                                />
                                                <datalist id="externalAgencies">
                                                    {sysConfig?.externalAgencies?.map((agency, i) => (
                                                        <option key={i} value={agency} />
                                                    ))}
                                                </datalist>
                                            </>
                                        ) : (
                                            <input disabled value={currentSchool.name} className="w-full px-4 md:px-5 py-3 border-2 border-slate-100 rounded-xl md:rounded-2xl font-bold text-sm bg-slate-50 text-slate-400" />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">ความเร่งด่วน</label>
                                        <select value={newDoc.priority} onChange={e => setNewDoc({...newDoc, priority: e.target.value as any})} className="w-full px-4 md:px-5 py-3 border-2 border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-600 cursor-pointer appearance-none bg-white">
                                            <option value="Normal">ปกติ</option>
                                            <option value="Urgent">ด่วน</option>
                                            <option value="Critical">ด่วนที่สุด</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">รายละเอียดหนังสือ (ย่อสรุปเนื้อความ)</label>
                                    <textarea placeholder="ระบุสาระสำคัญของหนังสือเพื่อให้ ผอ. พิจารณา..." value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})} className="w-full px-4 md:px-5 py-3 border-2 border-slate-200 rounded-xl md:rounded-2xl font-bold text-sm outline-none focus:border-blue-600 transition-all h-32" />
                                </div>
                            </div>
                            <div className="space-y-6 md:space-y-8">
                                <div className="p-4 md:p-8 bg-slate-50 rounded-2xl md:rounded-3xl border-2 border-slate-200 border-dashed relative">
                                    <h4 className="text-xs md:text-sm font-bold text-slate-700 mb-4 md:mb-6 flex items-center gap-3"><UploadCloud size={18} className="text-blue-600"/> จัดการไฟล์แนบ (PDF)</h4>
                                    <div className="flex flex-col gap-4">
                                        <label className="block w-full text-center py-4 md:py-6 bg-white border-2 border-blue-200 rounded-xl md:rounded-2xl border-dashed cursor-pointer hover:bg-blue-50 transition-all font-black text-blue-700 text-[10px] md:text-xs shadow-sm">
                                            <input type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) Array.from(e.target.files).forEach(f => handleFileUploadInBackground(f)); e.target.value = ''; }} />
                                            <Plus size={14} className="inline mr-2"/> เลือกไฟล์ PDF จากเครื่อง
                                        </label>
                                        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border shadow-inner">
                                            <input type="text" placeholder="ระบุลิงก์คลาวด์..." value={linkInput} onChange={e => setLinkInput(e.target.value)} className="flex-1 px-3 py-1 text-[10px] md:text-xs font-mono border-none outline-none"/><button type="button" onClick={() => { if (linkInput) { handleFetchAndUploadFromUrl(linkInput); setLinkInput(''); } }} className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 shadow active:scale-95 transition-all"><DownloadCloud size={16} /></button>
                                        </div>
                                    </div>
                                    <div className="mt-4 md:mt-6 space-y-2 max-h-40 overflow-y-auto">
                                        {tempAttachments.map(att => (
                                            <div key={att.id} className="flex justify-between items-center p-2 md:p-3 bg-white border rounded-lg md:rounded-xl shadow-sm">
                                                <div className="flex items-center gap-2 truncate text-[10px] md:text-xs font-bold text-slate-600">
                                                    <FileCheck size={12} className="text-green-500"/><span className="truncate max-w-[150px] md:max-w-[200px]">{att.name}</span>
                                                </div>
                                                <button type="button" onClick={() => setTempAttachments(prev => prev.filter(a => a.id !== att.id))} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {docCategory === 'ORDER' && (
                                    <div className="bg-indigo-50/50 p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 border-indigo-100 shadow-sm animate-fade-in">
                                        <h4 className="text-[10px] md:text-xs font-black text-indigo-900 uppercase mb-4 tracking-widest flex items-center gap-2"><Users size={14}/> เลือกผู้รับปฏิบัติ (ตามคำสั่ง)</h4>
                                        <TeacherSelectionGrid selectedIds={selectedTeachers} onToggle={setSelectedTeachers} currentSearch={teacherSearchTerm} onSearchChange={setTeacherSearchTerm}/>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 pt-6 md:pt-10 border-t-2 border-slate-200">
                            <button type="button" onClick={() => { setViewMode('LIST'); setIsEditMode(false); }} className="flex-1 py-4 md:py-5 bg-slate-100 text-slate-500 rounded-2xl md:rounded-[2rem] font-black uppercase tracking-widest transition-all text-xs md:text-sm">ยกเลิก</button>
                            <button type="submit" disabled={isSavingForm} className={`flex-[2] py-4 rounded-2xl font-black text-base md:text-xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${isSavingForm ? 'bg-slate-400' : 'bg-blue-700 hover:bg-blue-800 text-white'}`}>
                                {isSavingForm ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>} {isEditMode ? 'บันทึกการแก้ไข' : 'บันทึกและเสนอ ผอ.'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* DETAIL VIEW */}
            {viewMode === 'DETAIL' && selectedDoc && (
                <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 animate-fade-in pb-20">
                    <div className="flex justify-between items-center px-2">
                        <button type="button" onClick={() => setViewMode('LIST')} className="flex items-center gap-2 text-slate-400 hover:text-slate-800 font-black uppercase text-[10px] md:text-xs transition-colors group">
                            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> ย้อนกลับ
                        </button>
                        <div className="flex items-center gap-4">
                            <h2 className="text-base md:text-xl font-black text-slate-800 tracking-tight">รายละเอียดหนังสือ</h2>
                            {canManageDoc && (
                                <button 
                                    onClick={() => startEditDoc(selectedDoc)}
                                    className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                                    title="แก้ไขหนังสือ"
                                >
                                    <Edit3 size={20}/>
                                </button>
                            )}
                            {canManageDoc && (
                                <button 
                                    onClick={() => handleDeleteDoc(selectedDoc.id)}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    title="ลบหนังสือราชการ"
                                >
                                    <Trash2 size={20}/>
                                </button>
                            )}
                        </div>
                        <div className="w-12"></div>
                    </div>

                    <div className="bg-white rounded-2xl md:rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden relative">
                        <div className="bg-slate-50 px-6 md:px-10 py-6 md:py-8 border-b flex flex-col md:flex-row justify-between items-start gap-6 md:gap-10">
                            <div className="space-y-3 md:space-y-5 flex-1">
                                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                                    <span className={`px-3 md:px-5 py-1 md:py-2 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest shadow-sm border-2 ${selectedDoc.category === 'ORDER' ? 'bg-emerald-600 text-white border-emerald-400' : selectedDoc.category === 'OUTGOING' ? 'bg-orange-600 text-white border-orange-400' : 'bg-blue-600 text-white border-blue-400'}`}>{selectedDoc.category === 'ORDER' ? 'ประกาศ / คำสั่ง' : selectedDoc.category === 'OUTGOING' ? 'หนังสือส่ง' : 'หนังสือรับ'}</span>
                                    <span className="px-3 md:px-5 py-1 md:py-2 bg-slate-900 text-white rounded-full text-[8px] md:text-[10px] font-black font-mono">#{selectedDoc.bookNumber}</span>
                                    {selectedDoc.status === 'PendingDirector' && (
                                        <span className="px-5 py-2 bg-orange-600 text-white rounded-full text-[10px] md:text-xs font-black uppercase shadow-lg animate-pulse border-2 border-white ring-4 ring-orange-50">
                                            รอ ผอ. สั่งการ
                                        </span>
                                    )}
                                    {isDocOfficer && selectedDoc.directorCommand && selectedDoc.status !== 'PendingDirector' && (
                                        <span className="px-5 py-2 bg-purple-600 text-white rounded-full text-[10px] md:text-xs font-black uppercase shadow-lg border-2 border-white ring-4 ring-purple-50">
                                            ผอ. เกษียณแล้ว
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-lg md:text-2xl font-black text-slate-800 leading-tight break-words">{selectedDoc.title}</h2>
                                    <div className="flex flex-wrap gap-4 md:gap-8 text-[9px] md:text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">
                                        <span className="flex items-center gap-2">
                                            <History size={14} className="text-slate-300"/> 
                                            {selectedDoc.category === 'OUTGOING' ? 'ส่งถึง (ปลายทาง): ' : 'ต้นเรื่อง (จาก): '} 
                                            {selectedDoc.from}
                                        </span>
                                        <span className="flex items-center gap-2"><Clock size={14} className="text-slate-300"/> {selectedDoc.date}</span>
                                    </div>
                            </div>
                            <div className="flex md:flex-col items-center justify-center p-4 md:p-6 bg-white rounded-xl md:rounded-[2.5rem] border shadow-inner min-w-full md:min-w-[180px] gap-4 md:gap-0">
                                <p className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest md:mb-2">รับทราบ</p>
                                <div className="text-2xl md:text-4xl font-black text-blue-600">{(selectedDoc.acknowledgedBy || []).length} / {(selectedDoc.targetTeachers || []).length}</div>
                            </div>
                        </div>

                        <div className="p-6 md:p-10 lg:p-14 space-y-10 md:space-y-14">
                            {/* Summary / Description Section */}
                            <div className="bg-slate-50 p-6 md:p-10 rounded-3xl border border-slate-100 shadow-inner">
                                <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase mb-4 tracking-widest flex items-center gap-2"><Info size={14}/> รายละเอียด / สาระสำคัญ</h3>
                                <p className="text-slate-800 font-bold leading-relaxed whitespace-pre-wrap">{selectedDoc.description || 'ไม่มีข้อมูลรายละเอียดเพิ่มเติม'}</p>
                            </div>

                            <div>
                                <h3 className="text-[10px] md:text-xs font-black text-slate-800 uppercase flex items-center gap-3 tracking-[0.2em] mb-6 md:mb-8"><Bookmark size={14} className="text-blue-500"/> ไฟล์เอกสารแนบ</h3>
                                <div className="flex flex-col gap-3">
                                    {selectedDoc.signedFileUrl && (
                                        <button onClick={() => handleOpenAndAck(selectedDoc, selectedDoc.signedFileUrl!)} className="p-3 md:p-4 bg-emerald-600 text-white rounded-xl shadow-md flex items-center justify-between hover:bg-emerald-700 transition-all border-2 border-emerald-400 group text-left">
                                            <div className="flex items-center gap-3 md:gap-4 relative z-10">
                                                <FileCheck size={20}/>
                                                <div><p className="font-black text-sm md:text-lg">บันทึกข้อสั่งการ ผอ.</p><p className="text-[8px] md:text-[10px] font-bold opacity-80 uppercase tracking-widest">บันทึกข้อความสั่งการอิเล็กทรอนิกส์</p></div>
                                            </div>
                                            <ExternalLink size={16}/>
                                        </button>
                                    )}
                                    {selectedDoc.attachments.map((att, idx) => (
                                        <button key={idx} onClick={() => handleOpenAndAck(selectedDoc, att.url)} className="p-3 md:p-4 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-between hover:bg-blue-700 transition-all border-2 border-blue-400 text-left">
                                            <div className="flex items-center gap-3 md:gap-4"><FileIcon size={20}/><div><p className="font-black text-xs md:text-base truncate max-w-[200px] md:max-w-[400px]">{att.name}</p><p className="text-[8px] md:text-[10px] font-bold opacity-80 uppercase tracking-widest">เปิดอ่านไฟล์เอกสารต้นฉบับ</p></div></div>
                                            <ExternalLink size={16}/>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Director Action Panel */}
                            {isDirector && selectedDoc.status === 'PendingDirector' && (
                                <div className="bg-blue-50 p-2 md:p-10 rounded-xl md:rounded-[3.5rem] border-2 border-blue-400 shadow-2xl shadow-blue-500/10 space-y-4 md:space-y-10 animate-slide-up relative overflow-hidden">
                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-blue-200 pb-4 md:pb-6 relative z-10 px-4 md:px-0 pt-4 md:pt-0">
                                        <h3 className="text-base md:text-xl font-black text-slate-900 flex items-center gap-3"><PenTool size={18} className="text-blue-700"/> การสั่งการ (สร้างบันทึกข้อความ)</h3>
                                    </div>
                                    <div className="bg-white p-3 md:p-8 rounded-lg md:rounded-[2.5rem] border-2 border-blue-200 shadow-inner space-y-4 md:space-y-6 relative z-10 mx-2 md:mx-0">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="block text-[9px] md:text-[11px] font-black text-blue-600 uppercase tracking-widest ml-1">มอบหมายรองผู้อำนวยการ</label>
                                                <div className="flex gap-2">
                                                    <select value={assignedViceDirId} onChange={e => setAssignedViceDirId(e.target.value)} className="flex-1 pl-4 md:pl-6 pr-10 py-3 md:py-4 border-2 border-slate-300 rounded-xl md:rounded-2xl font-black bg-slate-50 outline-none appearance-none cursor-pointer text-slate-900 text-xs md:text-sm">
                                                        <option value="">-- ไม่มอบหมายรองฯ --</option>
                                                        {viceDirectors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                    </select>
                                                    <button onClick={handleQuickDelegateToVice} className={`px-4 md:px-6 py-3 rounded-xl md:rounded-2xl font-black transition-all flex items-center justify-center gap-2 active:scale-95 text-xs md:text-sm ${assignedViceDirId ? 'bg-blue-600 text-white shadow-xl' : 'bg-slate-100 text-slate-300'}`} disabled={!assignedViceDirId}><FastForward size={16}/></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 md:p-10 rounded-lg md:rounded-[3rem] border-2 border-blue-400 shadow-inner space-y-4 md:space-y-10 relative z-10 mx-0 md:mx-0 mb-4 md:mb-0">
                                        <textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="ระบุข้อความสั่งการ/เกษียณหนังสือ... (ระบบจะนำไปจัดรูปแบบในบันทึกข้อความศธ. อัตโนมัติ)" className="w-full p-4 md:p-8 bg-slate-50 border-2 border-slate-300 rounded-xl md:rounded-[2.5rem] h-32 md:h-40 outline-none focus:bg-white font-black text-slate-900 leading-relaxed placeholder:text-slate-300 text-sm md:text-lg shadow-inner" />
                                        <TeacherSelectionGrid selectedIds={selectedTeachers} onToggle={setSelectedTeachers} currentSearch={teacherSearchTerm} onSearchChange={setTeacherSearchTerm}/>
                                        <div className="flex flex-col sm:flex-row gap-4 px-0 md:px-0 pb-2 md:pb-0">
                                            <button onClick={handleDirectorAcknowledge} className="flex-1 py-3 md:py-4 bg-white border-2 border-blue-500 text-blue-700 rounded-xl md:rounded-[2rem] font-black text-xs md:text-sm hover:bg-blue-50 shadow-xl transition-all flex items-center justify-center gap-2"><CheckSquare size={18}/> รับทราบ</button>
                                            <button onClick={() => handleDirectorAction(true)} className="flex-1 py-3 md:py-4 bg-white border-2 border-emerald-500 text-emerald-700 rounded-xl md:rounded-[2rem] font-black text-xs md:text-sm hover:bg-emerald-50 shadow-xl transition-all">แจ้งเวียนเพื่อทราบ</button>
                                            <button onClick={() => handleDirectorAction(false)} className="flex-[2] py-3 md:py-4 bg-slate-900 text-white rounded-xl md:rounded-[2rem] font-black text-sm md:text-lg shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-3 active:scale-95"><FilePlus size={20}/> ลงนามและสั่งปฏิบัติ</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Vice-Director Action Panel */}
                            {selectedDoc.status === 'PendingViceDirector' && (isViceDirector || selectedDoc.assignedViceDirectorId === currentUser.id) && (
                                <div className="bg-indigo-50 p-2 md:p-10 rounded-xl md:rounded-[3.5rem] border-2 border-indigo-400 shadow-2xl shadow-indigo-500/10 space-y-4 md:space-y-10 animate-slide-up relative overflow-hidden">
                                    <div className="flex justify-between items-center relative z-10 px-4 md:px-0 pt-4 md:pt-0">
                                        <h3 className="text-base md:text-xl font-black text-slate-900 flex items-center gap-3"><PenTool size={18} className="text-indigo-700"/> การพิจารณา (ผู้รับมอบหมาย)</h3>
                                    </div>
                                    <div className="p-4 md:p-8 bg-white border-2 border-indigo-400 rounded-lg md:rounded-[2.5rem] text-sm md:text-md text-indigo-900 font-black italic shadow-inner mx-2 md:mx-0">"{selectedDoc.directorCommand || 'มอบพิจารณาดำเนินการ'}"</div>
                                    <div className="bg-white p-3 md:p-10 rounded-lg md:rounded-[3rem] border-2 border-indigo-400 shadow-inner space-y-4 md:space-y-10 relative z-10 mx-0 md:mx-0 mb-4 md:mb-0">
                                        <textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="ระบุข้อความสั่งการ..." className="w-full p-4 md:p-8 bg-slate-50 border-2 border-slate-300 rounded-xl md:rounded-[2.5rem] h-32 md:h-40 outline-none font-black text-slate-900 text-sm md:text-lg shadow-inner" />
                                        <TeacherSelectionGrid selectedIds={selectedTeachers} onToggle={setSelectedTeachers} currentSearch={teacherSearchTerm} onSearchChange={setTeacherSearchTerm}/>
                                        <button onClick={handleViceDirectorAction} className="w-full py-3 md:py-4 bg-indigo-600 text-white rounded-xl md:rounded-[2rem] font-black text-sm md:text-lg shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95 px-0 md:px-0"><FilePlus size={20}/> ลงนามสั่งปฏิบัติ</button>
                                    </div>
                                </div>
                            )}

                            {/* Staff Status Area (Distributed Docs Only) */}
                            {selectedDoc.status === 'Distributed' && (
                                <div className="space-y-8 md:space-y-12 animate-fade-in">
                                    <div className="bg-emerald-50/50 p-6 md:p-12 rounded-2xl md:rounded-[3.5rem] border-2 border-emerald-100 text-center space-y-4 md:space-y-6 shadow-inner relative overflow-hidden">
                                        {selectedDoc.acknowledgedBy?.includes(currentUser.id) ? (
                                            <div className="text-emerald-600 font-black flex flex-col items-center gap-3 md:gap-4">
                                                <div className="bg-emerald-100 p-4 md:p-6 rounded-full shadow-inner"><CheckCircle size={40} className="animate-bounce"/></div>
                                                <span className="text-xl md:text-3xl tracking-tight leading-none">ท่านได้รับทราบข้อสั่งการแล้ว</span>
                                                <div className="text-[8px] md:text-[10px] text-emerald-400 uppercase tracking-[0.3em] font-black">Acknowledgement Successful</div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3 md:space-y-4">
                                                <div className="bg-blue-100 p-4 md:p-6 rounded-full text-blue-600 w-fit mx-auto shadow-inner"><Info size={32} className="animate-pulse"/></div>
                                                <p className="text-slate-600 font-black text-lg md:text-2xl tracking-tight">กรุณาเปิดอ่านบันทึกสั่งการเพื่อรับทราบ</p>
                                                <p className="text-slate-400 text-[10px] md:text-sm font-bold uppercase tracking-widest">ระบบจะบันทึกสถานะการรับทราบให้ท่านโดยอัตโนมัติ</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Admin Visibility: Acknowledgement Tracking Table */}
                                    {(isDirector || isDocOfficer || isSystemAdmin) && (
                                        <div className="bg-white border-2 border-slate-50 p-6 md:p-10 rounded-2xl md:rounded-[3.5rem] shadow-sm relative">
                                            <h4 className="text-[10px] md:text-xs font-black text-slate-800 uppercase flex items-center gap-3 tracking-[0.2em] mb-6 md:mb-10"><Users size={16}/> สถานะการรับทราบ ({selectedDoc.acknowledgedBy.length}/{selectedDoc.targetTeachers.length})</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                                                {selectedDoc.targetTeachers.map(tid => { 
                                                    const t = allTeachers.find(at => at.id === tid); 
                                                    const isRead = (selectedDoc.acknowledgedBy || []).includes(tid); 
                                                    return (
                                                        <div key={tid} className={`p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all flex flex-col gap-2 md:gap-3 group relative ${isRead ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 grayscale opacity-60'}`}>
                                                            <div className="flex justify-between items-center">
                                                                <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center font-black text-[10px] md:text-xs ${isRead ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{t?.name[0] || '?'}</div>
                                                                {isRead ? <CheckCircle size={14} className="text-emerald-500"/> : <Clock size={14} className="text-slate-300"/>}
                                                            </div>
                                                            <div className="truncate">
                                                                <p className={`text-[10px] md:text-[11px] font-black truncate ${isRead ? 'text-emerald-900' : 'text-slate-500'}`}>{t?.name || tid}</p>
                                                                <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase truncate mt-0.5">{t?.position}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Component Styles */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
                @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
                .animate-shimmer { animation: shimmer 2s infinite linear; }
                .no-scrollbar-container::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default DocumentsSystem;