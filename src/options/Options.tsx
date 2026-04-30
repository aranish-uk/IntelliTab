import { useState, useEffect } from 'react';
import { Key, BookOpen, CheckCircle, BrainCircuit, RefreshCw, Upload, Download, Save, Link, Type, MessageSquare, Send, Settings, Cpu, Database, X, LayoutGrid, FolderOpen, RotateCcw, Trash2, ChevronDown, ChevronRight, Eye, Zap } from 'lucide-react';
import { getLearnedPatterns, getSoulText, saveLearnedPatterns, saveSoulText } from '../lib/learningEngine';
import { exportTemplate, downloadTemplate, validateTemplate, importTemplate, ImportOptions } from '../lib/templateEngine';
import { LastAction, AIConfig, AIProvider, GroupConfig, GroupPermission, Workspace, PopupSettings, DEFAULT_POPUP_SETTINGS, AutoOrganizeConfig, DEFAULT_AUTO_ORGANIZE, StaleTabConfig, DEFAULT_STALE_CONFIG, IntelliTabTemplate, SyncConfig, DEFAULT_SYNC_CONFIG, ContextGroupConfig, DEFAULT_CONTEXT_GROUP } from '../types';

const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
    claude: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest' },
    groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-3.5-turbo' },
    custom: { baseUrl: '', model: '' }
};

export default function Options() {
    const [activeTab, setActiveTab] = useState<'model' | 'groups' | 'automation' | 'workspaces' | 'feedback' | 'advanced'>('model');
    const [aiConfig, setAIConfig] = useState<AIConfig>({
        provider: 'groq',
        apiKey: '',
        model: 'llama-3.3-70b-versatile',
        baseUrl: 'https://api.groq.com/openai/v1',
        savedConfigs: {}
    });
    const [status, setStatus] = useState('');
    const [soulText, setSoulText] = useState('');
    const [learnedJson, setLearnedJson] = useState('{}');
    const [learningStatus, setLearningStatus] = useState('');

    const [feedbackInput, setFeedbackInput] = useState('');
    const [chatLog, setChatLog] = useState<{ sender: 'user' | 'ai', message: string }[]>([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [lastAction, setLastAction] = useState<LastAction | null>(null);

    const [groupConfigs, setGroupConfigs] = useState<GroupConfig[]>([
        { name: 'Dev', permission: 'editable' },
        { name: 'Study', permission: 'editable' },
        { name: 'Entertainment', permission: 'editable' },
        { name: 'Communication', permission: 'editable' }
    ]);
    const [newGroupName, setNewGroupName] = useState('');

    // Workspace state
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [expandedWs, setExpandedWs] = useState<string | null>(null);
    const [wsLoading, setWsLoading] = useState(false);
    const [wsMessage, setWsMessage] = useState('');
    const [mergeExisting, setMergeExisting] = useState(true);

    // Popup settings state
    const [popupSettings, setPopupSettings] = useState<PopupSettings>(DEFAULT_POPUP_SETTINGS);

    // Context-aware grouping (non-LLM fast path) state
    const [contextConfig, setContextConfig] = useState<ContextGroupConfig>(DEFAULT_CONTEXT_GROUP);

    // Auto-organize state
    const [autoConfig, setAutoConfig] = useState<AutoOrganizeConfig>(DEFAULT_AUTO_ORGANIZE);
    const [autoStatus, setAutoStatus] = useState('');
    const [lastAutoRun, setLastAutoRun] = useState<number | null>(null);

    // Stale tab config state
    const [staleConfig, setStaleConfig] = useState<StaleTabConfig>(DEFAULT_STALE_CONFIG);

    // Sync state
    const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
    const [syncStatus, setSyncStatus] = useState('');
    const [syncing, setSyncing] = useState(false);

    // Template state
    const [templateName, setTemplateName] = useState('');
    const [templateIncludePatterns, setTemplateIncludePatterns] = useState(false);
    const [templateStatus, setTemplateStatus] = useState('');
    const [importPreview, setImportPreview] = useState<IntelliTabTemplate | null>(null);
    const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');

    useEffect(() => {
        chrome.storage.local.get(['aiConfig', 'groqApiKey', 'lastAction', 'groupConfigs'], (result) => {
            if (result.aiConfig) {
                // Ensure savedConfigs exists
                const config = { ...result.aiConfig, savedConfigs: result.aiConfig.savedConfigs || {} };
                setAIConfig(config);
            } else if (result.groqApiKey) {
                // Migration
                const initialConfig: AIConfig = {
                    provider: 'groq',
                    apiKey: result.groqApiKey,
                    model: 'llama-3.3-70b-versatile',
                    baseUrl: 'https://api.groq.com/openai/v1',
                    savedConfigs: {
                        groq: {
                            apiKey: result.groqApiKey,
                            baseUrl: 'https://api.groq.com/openai/v1',
                            model: 'llama-3.3-70b-versatile'
                        }
                    }
                };
                setAIConfig(initialConfig);
                chrome.storage.local.set({ aiConfig: initialConfig });
            }
            if (result.lastAction) setLastAction(result.lastAction);

            let currentGroupConfigs = result.groupConfigs || [
                { name: 'Dev', permission: 'editable' },
                { name: 'Study', permission: 'editable' },
                { name: 'Entertainment', permission: 'editable' },
                { name: 'Communication', permission: 'editable' }
            ];

            // Fetch currently open groups and add them if they don't exist
            if (chrome.tabGroups) {
                chrome.tabGroups.query({}, (groups) => {
                    const openGroupNames = Array.from(new Set(groups.map(g => g.title).filter(Boolean))) as string[];
                    let updated = false;
                    for (const name of openGroupNames) {
                        if (name && !currentGroupConfigs.some((g: GroupConfig) => g.name === name)) {
                            currentGroupConfigs.push({ name, permission: 'editable' });
                            updated = true;
                        }
                    }
                    if (updated && !result.groupConfigs) {
                        chrome.storage.local.set({ groupConfigs: currentGroupConfigs });
                    } else if (updated) {
                        chrome.storage.local.set({ groupConfigs: currentGroupConfigs });
                    }
                    setGroupConfigs(currentGroupConfigs);
                });
            } else {
                setGroupConfigs(currentGroupConfigs);
            }
        });

        const loadData = async () => {
            const p = await getLearnedPatterns();
            setLearnedJson(JSON.stringify(p, null, 2));
            const s = await getSoulText();
            setSoulText(s);
        };
        loadData();
        loadWorkspaces();

        // Load popup settings
        chrome.runtime.sendMessage({ action: 'getPopupSettings' }, (response) => {
            if (response && !response.error) setPopupSettings(response);
        });

        // Load context-grouping config
        chrome.runtime.sendMessage({ action: 'getContextGroupConfig' }, (response) => {
            if (response && !response.error) setContextConfig(response);
        });

        // Load auto-organize config
        chrome.runtime.sendMessage({ action: 'getAutoOrganizeConfig' }, (response) => {
            if (response && !response.error) setAutoConfig(response);
        });
        chrome.runtime.sendMessage({ action: 'getAutoOrganizeStatus' }, (response) => {
            if (response?.lastRun) setLastAutoRun(response.lastRun);
        });

        // Load stale tab config
        chrome.runtime.sendMessage({ action: 'getStaleConfig' }, (response) => {
            if (response && !response.error) setStaleConfig(response);
        });

        // Load sync config
        chrome.runtime.sendMessage({ action: 'getSyncConfig' }, (response) => {
            if (response && !response.error) setSyncConfig(response);
        });
    }, []);

    const loadWorkspaces = () => {
        chrome.runtime.sendMessage({ action: 'getWorkspaces' }, (response) => {
            if (response && response.workspaces) {
                setWorkspaces(response.workspaces);
            }
        });
    };

    const handleRestoreWorkspace = (id: string) => {
        setWsLoading(true);
        setWsMessage('');
        chrome.runtime.sendMessage({ action: 'restoreWorkspace', workspaceId: id, mergeExisting }, (response) => {
            setWsLoading(false);
            if (response?.error) {
                setWsMessage(`Error: ${response.error}`);
            } else {
                setWsMessage(`Restored ${response.groupsRestored} groups (${response.tabsRestored} tabs)`);
            }
            setTimeout(() => setWsMessage(''), 4000);
        });
    };

    const handleRestoreGroup = (wsId: string, groupId: string) => {
        setWsLoading(true);
        chrome.runtime.sendMessage({ action: 'restoreGroup', workspaceId: wsId, groupId, mergeExisting }, (response) => {
            setWsLoading(false);
            if (response?.error) {
                setWsMessage(`Error: ${response.error}`);
            } else {
                setWsMessage(`Restored ${response.tabsRestored} tabs`);
            }
            setTimeout(() => setWsMessage(''), 4000);
        });
    };

    const handleDeleteWorkspace = (id: string) => {
        if (!confirm('Delete this workspace? This cannot be undone.')) return;
        chrome.runtime.sendMessage({ action: 'deleteWorkspace', workspaceId: id }, (response) => {
            if (!response?.error) {
                loadWorkspaces();
                if (expandedWs === id) setExpandedWs(null);
            }
        });
    };

    const colorDot: Record<string, string> = {
        blue: '#4285f4', red: '#ea4335', yellow: '#fbbc04', green: '#34a853',
        pink: '#ff6d93', purple: '#a142f4', cyan: '#24c1e0', orange: '#fa903e', grey: '#9aa0a6',
    };

    const handleSaveConfig = () => {
        // Before saving, ensure the current UI state is reflected in the savedConfigs map
        const updatedSavedConfigs = {
            ...(aiConfig.savedConfigs || {}),
            [aiConfig.provider]: {
                apiKey: aiConfig.apiKey,
                baseUrl: aiConfig.baseUrl || '',
                model: aiConfig.model
            }
        };

        const finalConfig = { ...aiConfig, savedConfigs: updatedSavedConfigs };
        setAIConfig(finalConfig);

        chrome.storage.local.set({ aiConfig: finalConfig }, () => {
            setStatus('Configuration saved successfully!');
            setTimeout(() => setStatus(''), 3000);
        });
    };

    const handleProviderChange = (newProvider: AIProvider) => {
        // 1. Save current UI values to the map for the CURRENT provider
        const updatedSavedConfigs = {
            ...(aiConfig.savedConfigs || {}),
            [aiConfig.provider]: {
                apiKey: aiConfig.apiKey,
                baseUrl: aiConfig.baseUrl || '',
                model: aiConfig.model
            }
        };

        // 2. Load values for the NEW provider
        const newProviderSaved = updatedSavedConfigs[newProvider];
        const defaults = PROVIDER_DEFAULTS[newProvider];

        setAIConfig({
            ...aiConfig,
            provider: newProvider,
            apiKey: newProviderSaved?.apiKey || '',
            baseUrl: newProviderSaved?.baseUrl || defaults.baseUrl,
            model: newProviderSaved?.model || defaults.model,
            savedConfigs: updatedSavedConfigs
        });
    };

    const handleSaveSoul = async () => {
        await saveSoulText(soulText);
        setLearningStatus('SOUL updated!');
        setTimeout(() => setLearningStatus(''), 3000);
    };

    const handleAddGroup = () => {
        if (!newGroupName.trim()) return;
        if (groupConfigs.some(g => g.name.toLowerCase() === newGroupName.trim().toLowerCase())) return;
        const updated = [...groupConfigs, { name: newGroupName.trim(), permission: 'editable' as GroupPermission }];
        setGroupConfigs(updated);
        setNewGroupName('');
        chrome.storage.local.set({ groupConfigs: updated });
    };

    const handleRemoveGroup = (name: string) => {
        const updated = groupConfigs.filter(g => g.name !== name);
        setGroupConfigs(updated);
        chrome.storage.local.set({ groupConfigs: updated });
        // Also ungroup those tabs in the browser
        chrome.runtime.sendMessage({ action: 'removeBrowserGroup', groupName: name });
    };

    const refreshGroupsFromBrowser = () => {
        if (!chrome.tabGroups) return;
        chrome.tabGroups.query({}, (groups) => {
            const openGroupNames = Array.from(new Set(groups.map(g => g.title).filter(Boolean))) as string[];
            let updated = [...groupConfigs];
            let changed = false;
            for (const name of openGroupNames) {
                if (name && !updated.some(g => g.name === name)) {
                    updated.push({ name, permission: 'editable' });
                    changed = true;
                }
            }
            if (changed) {
                setGroupConfigs(updated);
                chrome.storage.local.set({ groupConfigs: updated });
            }
        });
    };

    const handleUpdatePermission = (name: string, permission: GroupPermission) => {
        const updated = groupConfigs.map(g => g.name === name ? { ...g, permission } : g);
        setGroupConfigs(updated);
        chrome.storage.local.set({ groupConfigs: updated });
    };

    const onDragStart = (e: React.DragEvent, groupName: string) => {
        e.dataTransfer.setData('groupName', groupName);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const onDrop = (e: React.DragEvent, newPermission: GroupPermission) => {
        e.preventDefault();
        const groupName = e.dataTransfer.getData('groupName');
        if (groupName) {
            handleUpdatePermission(groupName, newPermission);
        }
    };

    const clearLearned = async () => {
        if (confirm("Are you sure you want to clear all learned grouping habits?")) {
            await saveLearnedPatterns({});
            setLearnedJson('{}');
            setLearningStatus('Learning reset!');
            setTimeout(() => setLearningStatus(''), 3000);
        }
    };

    const handleAutoConfigChange = (updates: Partial<AutoOrganizeConfig>) => {
        const updated = { ...autoConfig, ...updates };
        setAutoConfig(updated);
        chrome.runtime.sendMessage({ action: 'saveAutoOrganizeConfig', config: updated }, () => {
            setAutoStatus('Saved');
            setTimeout(() => setAutoStatus(''), 2000);
        });
    };

    const handleSyncConfigChange = (updates: Partial<SyncConfig>) => {
        const updated = { ...syncConfig, ...updates };
        setSyncConfig(updated);
        chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: updated });
    };

    const handleSyncNow = () => {
        setSyncing(true);
        setSyncStatus('');
        chrome.runtime.sendMessage({ action: 'syncNow' }, (response) => {
            setSyncing(false);
            if (response?.error) {
                setSyncStatus(`Error: ${response.error}`);
            } else {
                const parts = [];
                if (response?.soulUpdated) parts.push('SOUL updated');
                if (response?.rulesUpdated) parts.push('rules synced');
                if (response?.groupsUpdated) parts.push('groups synced');
                setSyncStatus(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Everything is up to date');
                // Refresh last synced time
                chrome.runtime.sendMessage({ action: 'getSyncConfig' }, (r) => {
                    if (r && !r.error) setSyncConfig(r);
                });
            }
            setTimeout(() => setSyncStatus(''), 5000);
        });
    };

    const handleExportTemplate = async () => {
        const name = templateName.trim() || 'My Setup';
        const template = await exportTemplate(name, templateIncludePatterns);
        downloadTemplate(template);
        setTemplateStatus('Template exported!');
        setTimeout(() => setTemplateStatus(''), 3000);
    };

    const handleImportFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const content = ev.target?.result as string;
                const result = validateTemplate(content);
                if (!result.valid) {
                    setTemplateStatus(`Invalid: ${result.errors.join(', ')}`);
                    setTimeout(() => setTemplateStatus(''), 5000);
                    return;
                }
                setImportPreview(result.template!);
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleImportTemplate = async () => {
        if (!importPreview) return;
        const options: ImportOptions = {
            mode: importMode,
            importSoul: true,
            importRules: true,
            importGroups: true,
            importPatterns: !!importPreview.learnedPatterns,
        };
        const result = await importTemplate(importPreview, options);
        setImportPreview(null);
        setTemplateStatus(
            `Imported: SOUL ${result.soulUpdated ? 'updated' : 'skipped'}, ${result.rulesImported} rules, ${result.groupsImported} groups, ${result.patternsImported} patterns`
        );
        // Refresh local state
        const p = await getLearnedPatterns();
        setLearnedJson(JSON.stringify(p, null, 2));
        const s = await getSoulText();
        setSoulText(s);
        setTimeout(() => setTemplateStatus(''), 5000);
    };

    const handleStaleConfigChange = (updates: Partial<StaleTabConfig>) => {
        const updated = { ...staleConfig, ...updates };
        setStaleConfig(updated);
        chrome.runtime.sendMessage({ action: 'saveStaleConfig', config: updated });
    };

    const handleContextConfigChange = (key: keyof ContextGroupConfig, value: boolean) => {
        const updated = { ...contextConfig, [key]: value };
        setContextConfig(updated);
        chrome.runtime.sendMessage({ action: 'saveContextGroupConfig', config: updated });
    };

    const handlePopupSettingChange = (key: keyof PopupSettings, value: boolean) => {
        const updated = { ...popupSettings, [key]: value };
        // Ensure at least one tab is visible
        const anyVisible = Object.values(updated).some(v => v);
        if (!anyVisible) return;
        setPopupSettings(updated);
        chrome.runtime.sendMessage({ action: 'savePopupSettings', settings: updated });
    };

    const exportLearnedJson = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(learnedJson);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "intellitab_learning.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const importLearnedJson = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    const parsed = JSON.parse(content);
                    await saveLearnedPatterns(parsed);
                    setLearnedJson(JSON.stringify(parsed, null, 2));
                    setLearningStatus('Learned JSON imported!');
                    setTimeout(() => setLearningStatus(''), 3000);
                } catch (err) {
                    setLearningStatus('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const submitFeedback = () => {
        if (!feedbackInput.trim()) return;
        const userMsg = feedbackInput.trim();
        setFeedbackInput('');
        const newChatLog = [...chatLog, { sender: 'user' as const, message: userMsg }];
        setChatLog(newChatLog);
        setChatLoading(true);

        chrome.runtime.sendMessage({ action: 'processFeedback', chatLog: newChatLog }, async (response) => {
            setChatLoading(false);
            if (chrome.runtime.lastError || response?.error) {
                setChatLog(prev => [...prev, { sender: 'ai', message: `Error: ${response?.error || 'Communication failure'}` }]);
                return;
            }
            setChatLog(prev => [...prev, { sender: 'ai', message: response.responseMessage || "Got it. I've updated my rules." }]);
            const p = await getLearnedPatterns();
            setLearnedJson(JSON.stringify(p, null, 2));
            const s = await getSoulText();
            setSoulText(s);
        });
    };

    const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === id
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );

    return (
        <div className="max-w-4xl mx-auto px-6 py-10 pb-20" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>
            {/* Page Header */}
            <div className="mb-8 text-center flex flex-col items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <BrainCircuit className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
                    IntelliTab
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>AI-powered tab organizer & memory core</p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex justify-center mb-8 border-b" style={{ borderColor: 'var(--border-glass)' }}>
                <TabButton id="model" label="Model" icon={Cpu} />
                <TabButton id="groups" label="Groups" icon={LayoutGrid} />
                <TabButton id="automation" label="Automation" icon={Zap} />
                <TabButton id="workspaces" label="Workspaces" icon={FolderOpen} />
                <TabButton id="feedback" label="Feedback" icon={MessageSquare} />
                <TabButton id="advanced" label="Advanced" icon={Settings} />
            </div>

            <div className="flex flex-col gap-6">

                {/* ─── GROUPS PAGE ──────────────────────── */}
                {activeTab === 'groups' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <LayoutGrid className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                    <h2 className="text-xl font-semibold tracking-tight">Group Permissions</h2>
                                </div>
                                <button
                                    onClick={refreshGroupsFromBrowser}
                                    className="bg-glass hover:bg-glass-hover text-text-primary px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-glass transition-all"
                                    title="Pull currently open groups from the browser"
                                >
                                    <RefreshCw className="w-4 h-4" /> Refresh from Browser
                                </button>
                            </div>
                            <p className="text-sm text-text-secondary mb-6">Create custom groups and drag them into columns to control how the AI can interact with them.</p>

                            <div className="flex gap-4 mb-8">
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="New Group Name (e.g., Reading List)"
                                    className="themed-input flex-1 px-4 py-3 rounded-xl text-sm"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                                />
                                <button onClick={handleAddGroup} className="btn-primary px-6 rounded-xl text-sm font-medium">Add Group</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Editable Column */}
                                <div
                                    className="flex flex-col gap-3 p-4 rounded-xl border border-glass bg-glass-hover min-h-[200px]"
                                    onDragOver={onDragOver}
                                    onDrop={(e) => onDrop(e, 'editable')}
                                >
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-glass">
                                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }}></div>
                                        <h3 className="font-medium text-sm">Editable</h3>
                                        <span className="text-xs text-text-muted ml-auto">Add & Remove</span>
                                    </div>
                                    {groupConfigs.filter(g => g.permission === 'editable').map(g => (
                                        <div
                                            key={g.name}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, g.name)}
                                            className="flex items-center justify-between p-3 rounded-lg bg-accent-soft cursor-grab active:cursor-grabbing border border-glass"
                                        >
                                            <span className="font-medium text-sm">{g.name}</span>
                                            <button onClick={() => handleRemoveGroup(g.name)} className="text-text-muted hover:text-danger"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add-Only Column */}
                                <div
                                    className="flex flex-col gap-3 p-4 rounded-xl border border-glass bg-glass-hover min-h-[200px]"
                                    onDragOver={onDragOver}
                                    onDrop={(e) => onDrop(e, 'append_only')}
                                >
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-glass">
                                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--warning, #f59e0b)' }}></div>
                                        <h3 className="font-medium text-sm">Add Only</h3>
                                        <span className="text-xs text-text-muted ml-auto">Append Only</span>
                                    </div>
                                    {groupConfigs.filter(g => g.permission === 'append_only').map(g => (
                                        <div
                                            key={g.name}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, g.name)}
                                            className="flex items-center justify-between p-3 rounded-lg bg-accent-soft cursor-grab active:cursor-grabbing border border-glass"
                                        >
                                            <span className="font-medium text-sm">{g.name}</span>
                                            <button onClick={() => handleRemoveGroup(g.name)} className="text-text-muted hover:text-danger"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>

                                {/* Locked Column */}
                                <div
                                    className="flex flex-col gap-3 p-4 rounded-xl border border-glass bg-glass-hover min-h-[200px]"
                                    onDragOver={onDragOver}
                                    onDrop={(e) => onDrop(e, 'locked')}
                                >
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-glass">
                                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--danger)' }}></div>
                                        <h3 className="font-medium text-sm">Locked</h3>
                                        <span className="text-xs text-text-muted ml-auto">No Changes</span>
                                    </div>
                                    {groupConfigs.filter(g => g.permission === 'locked').map(g => (
                                        <div
                                            key={g.name}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, g.name)}
                                            className="flex items-center justify-between p-3 rounded-lg bg-accent-soft cursor-grab active:cursor-grabbing border border-glass"
                                        >
                                            <span className="font-medium text-sm">{g.name}</span>
                                            <button onClick={() => handleRemoveGroup(g.name)} className="text-text-muted hover:text-danger"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── AUTOMATION PAGE ──────────────────────── */}
                {activeTab === 'automation' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <Zap className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                    <h2 className="text-xl font-semibold tracking-tight">Auto-Organize</h2>
                                </div>
                                {autoStatus && (
                                    <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>{autoStatus}</span>
                                )}
                            </div>
                            <p className="text-sm text-text-secondary mb-6">
                                Automatically organize your tabs when they pile up. Requires an API key to be configured.
                            </p>

                            {/* Master toggle */}
                            <label className="flex items-center justify-between p-4 rounded-xl border border-glass mb-6 cursor-pointer hover:bg-glass transition-all">
                                <div>
                                    <span className="font-medium text-sm">Enable auto-organize</span>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        Tabs are organized automatically when ungrouped tabs pile up
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={autoConfig.enabled}
                                    onChange={(e) => handleAutoConfigChange({ enabled: e.target.checked })}
                                    className="w-5 h-5 rounded"
                                />
                            </label>

                            {autoConfig.enabled && (
                                <div className="flex flex-col gap-5">
                                    {/* Threshold */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                                Ungrouped tab threshold
                                            </label>
                                            <span className="text-sm font-medium">{autoConfig.ungroupedThreshold}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={5}
                                            max={30}
                                            value={autoConfig.ungroupedThreshold}
                                            onChange={(e) => handleAutoConfigChange({ ungroupedThreshold: parseInt(e.target.value) })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                                            <span>5 (aggressive)</span>
                                            <span>30 (relaxed)</span>
                                        </div>
                                    </div>

                                    {/* Burst detection */}
                                    <label className="flex items-center justify-between p-4 rounded-xl border border-glass cursor-pointer hover:bg-glass transition-all">
                                        <div>
                                            <span className="font-medium text-sm">Burst detection</span>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                Trigger when {autoConfig.burstCount}+ tabs open within {autoConfig.burstWindow / 1000}s
                                            </p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={autoConfig.burstDetection}
                                            onChange={(e) => handleAutoConfigChange({ burstDetection: e.target.checked })}
                                            className="w-5 h-5 rounded"
                                        />
                                    </label>

                                    {/* Cooldown */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                                Cooldown between runs
                                            </label>
                                            <span className="text-sm font-medium">{autoConfig.cooldownMinutes} min</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={1}
                                            max={60}
                                            value={autoConfig.cooldownMinutes}
                                            onChange={(e) => handleAutoConfigChange({ cooldownMinutes: parseInt(e.target.value) })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                                            <span>1 min</span>
                                            <span>60 min</span>
                                        </div>
                                    </div>

                                    {/* Last run info */}
                                    {lastAutoRun && (
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            Last auto-organize: {new Date(lastAutoRun).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tab Hygiene / Stale Tabs */}
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <RefreshCw className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Tab Hygiene</h2>
                            </div>
                            <p className="text-sm text-text-secondary mb-6">
                                Detect tabs you haven't visited in a while. Archive or close them to keep your browser clean.
                            </p>

                            {/* Master toggle */}
                            <label className="flex items-center justify-between p-4 rounded-xl border border-glass mb-6 cursor-pointer hover:bg-glass transition-all">
                                <div>
                                    <span className="font-medium text-sm">Enable stale tab detection</span>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        Periodically check for tabs you haven't used
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={staleConfig.enabled}
                                    onChange={(e) => handleStaleConfigChange({ enabled: e.target.checked })}
                                    className="w-5 h-5 rounded"
                                />
                            </label>

                            {staleConfig.enabled && (
                                <div className="flex flex-col gap-5">
                                    {/* Stale threshold */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                                Mark as stale after
                                            </label>
                                            <span className="text-sm font-medium">{staleConfig.staleAfterHours}h</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={4}
                                            max={168}
                                            step={4}
                                            value={staleConfig.staleAfterHours}
                                            onChange={(e) => handleStaleConfigChange({ staleAfterHours: parseInt(e.target.value) })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                                            <span>4 hours</span>
                                            <span>7 days</span>
                                        </div>
                                    </div>

                                    {/* Auto-archive */}
                                    <label className="flex items-center justify-between p-4 rounded-xl border border-glass cursor-pointer hover:bg-glass transition-all">
                                        <div>
                                            <span className="font-medium text-sm">Auto-archive stale tabs</span>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                Automatically save stale tabs to a workspace and close them
                                            </p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={staleConfig.autoArchive}
                                            onChange={(e) => handleStaleConfigChange({ autoArchive: e.target.checked })}
                                            className="w-5 h-5 rounded"
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── WORKSPACES PAGE ──────────────────────── */}
                {activeTab === 'workspaces' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <FolderOpen className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Saved Workspaces</h2>
                            </div>
                            <p className="text-sm text-text-secondary mb-4">
                                Workspaces are snapshots of your tab groups. Save a workspace from the popup, then restore it here anytime.
                            </p>

                            <label className="flex items-center gap-2 mb-6 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={mergeExisting}
                                    onChange={(e) => setMergeExisting(e.target.checked)}
                                    className="w-4 h-4 rounded"
                                />
                                <span className="text-sm">Merge with existing tabs on restore (reuse open tabs instead of duplicating)</span>
                            </label>

                            {wsMessage && (
                                <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium" style={{
                                    background: wsMessage.startsWith('Error') ? 'var(--danger-bg)' : 'var(--success-bg)',
                                    color: wsMessage.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                                }}>
                                    <CheckCircle className="w-4 h-4" />
                                    {wsMessage}
                                </div>
                            )}

                            {workspaces.length === 0 ? (
                                <div className="text-center py-12">
                                    <FolderOpen className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No saved workspaces yet.</p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Use the popup to save your current tab groups as a workspace.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {workspaces.map(ws => (
                                        <div key={ws.id} className="glass-card-solid rounded-xl overflow-hidden">
                                            {/* Workspace header */}
                                            <div
                                                className="flex items-center gap-3 p-5 cursor-pointer hover:bg-glass-hover transition-all"
                                                onClick={() => setExpandedWs(expandedWs === ws.id ? null : ws.id)}
                                            >
                                                {expandedWs === ws.id
                                                    ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                                    : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                                }
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-sm">{ws.name}</h3>
                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                        {ws.groups.length} groups &middot; {ws.groups.reduce((acc, g) => acc + g.tabs.length, 0)} tabs &middot; Saved {new Date(ws.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleRestoreWorkspace(ws.id)}
                                                        disabled={wsLoading}
                                                        className="btn-primary px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-40"
                                                    >
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                        Restore
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteWorkspace(ws.id)}
                                                        className="p-2 rounded-lg transition-all border border-glass hover:bg-glass-hover"
                                                        style={{ color: 'var(--danger)' }}
                                                        title="Delete workspace"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded groups */}
                                            {expandedWs === ws.id && (
                                                <div className="px-5 pb-5 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border-glass)' }}>
                                                    {ws.groups.map(g => (
                                                        <div key={g.id} className="rounded-xl p-4" style={{ background: 'var(--accent-soft)' }}>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div
                                                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                                                    style={{ background: colorDot[g.color] || colorDot.grey }}
                                                                />
                                                                <span className="font-medium text-sm flex-1">{g.name}</span>
                                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                                    {g.tabs.length} tabs
                                                                </span>
                                                                <button
                                                                    onClick={() => handleRestoreGroup(ws.id, g.id)}
                                                                    disabled={wsLoading}
                                                                    className="bg-glass hover:bg-glass-hover text-text-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-glass transition-all disabled:opacity-40"
                                                                >
                                                                    <RotateCcw className="w-3 h-3" />
                                                                    Restore
                                                                </button>
                                                            </div>
                                                            <ul className="flex flex-col gap-1 ml-5">
                                                                {g.tabs.map((t, idx) => (
                                                                    <li key={idx} className="text-xs truncate" style={{ color: 'var(--text-secondary)' }} title={t.url}>
                                                                        {t.title || t.domain}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── MODEL PAGE ──────────────────────── */}
                {activeTab === 'model' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Cpu className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">AI Configuration</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">AI Provider</label>
                                        <select
                                            value={aiConfig.provider}
                                            onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
                                            className="themed-input px-4 py-3 rounded-xl text-sm appearance-none bg-transparent"
                                        >
                                            <option value="openai">OpenAI</option>
                                            <option value="gemini">Google Gemini</option>
                                            <option value="claude">Anthropic Claude</option>
                                            <option value="groq">Groq (Llama 3)</option>
                                            <option value="openrouter">OpenRouter</option>
                                            <option value="custom">Custom Endpoint</option>
                                        </select>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">API Key</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                            <input
                                                type="password"
                                                value={aiConfig.apiKey}
                                                onChange={(e) => setAIConfig({ ...aiConfig, apiKey: e.target.value })}
                                                placeholder="sk-..."
                                                className="themed-input w-full pl-11 pr-4 py-3 rounded-xl text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">API Base URL</label>
                                        <div className="relative">
                                            <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                            <input
                                                type="text"
                                                value={aiConfig.baseUrl}
                                                onChange={(e) => setAIConfig({ ...aiConfig, baseUrl: e.target.value })}
                                                placeholder="https://api..."
                                                className="themed-input w-full pl-11 pr-4 py-3 rounded-xl text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Model ID</label>
                                        <div className="relative">
                                            <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                            <input
                                                type="text"
                                                value={aiConfig.model}
                                                onChange={(e) => setAIConfig({ ...aiConfig, model: e.target.value })}
                                                placeholder="gpt-4o..."
                                                className="themed-input w-full pl-11 pr-4 py-3 rounded-xl text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-glass)' }}>
                                <p className="text-xs text-text-muted max-w-sm">
                                    {aiConfig.provider === 'groq' && 'Fast and free inference using Llama 3 models.'}
                                    {aiConfig.provider === 'openai' && 'Standard high-performance GPT-4 models.'}
                                    {aiConfig.provider === 'openrouter' && 'Access any model through a unified gateway.'}
                                </p>
                                <button onClick={handleSaveConfig} className="btn-primary px-8 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                                    <Save className="w-4 h-4" /> Save Configuration
                                </button>
                            </div>

                            {status && (
                                <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                    <CheckCircle className="w-4 h-4" />
                                    {status}
                                </div>
                            )}
                        </div>

                        <div className="glass-card rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <BookOpen className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                                <h3 className="text-sm font-semibold">How to get keys</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                                <a href="https://console.groq.com" target="_blank" className="p-3 rounded-xl border border-glass hover:bg-glass transition-all">Groq Console →</a>
                                <a href="https://platform.openai.com" target="_blank" className="p-3 rounded-xl border border-glass hover:bg-glass transition-all">OpenAI Platform →</a>
                                <a href="https://openrouter.ai/keys" target="_blank" className="p-3 rounded-xl border border-glass hover:bg-glass transition-all">OpenRouter Keys →</a>
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="p-3 rounded-xl border border-glass hover:bg-glass transition-all">Gemini AI Studio →</a>
                                <a href="https://console.anthropic.com/" target="_blank" className="p-3 rounded-xl border border-glass hover:bg-glass transition-all">Claude Console →</a>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── FEEDBACK PAGE ──────────────────────── */}
                {activeTab === 'feedback' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="glass-card rounded-2xl overflow-hidden">
                            <div className="p-6 flex flex-col gap-6">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                    <h2 className="text-xl font-semibold tracking-tight">AI Training Chat</h2>
                                </div>

                                <div className="glass-card-solid rounded-xl p-5">
                                    <h3 className="text-xs font-semibold uppercase tracking-widest mb-3 text-text-tertiary">Last Action Memory</h3>
                                    {lastAction ? (
                                        <div className="text-xs max-h-48 overflow-y-auto pr-2 text-text-secondary">
                                            <p className="mb-3">Organized {lastAction.tabsOrganized} tabs.</p>
                                            <div className="flex flex-col gap-2">
                                                {lastAction.groupsCreated.map((g, i) => (
                                                    <div key={i} className="p-3 rounded-lg bg-accent-soft border border-glass">
                                                        <div className="font-medium mb-1 text-text-primary">
                                                            {g.groupName} <span className="text-text-muted">({g.tabCount})</span>
                                                        </div>
                                                        <ul className="list-disc list-inside ml-1 text-text-tertiary space-y-0.5">
                                                            {g.tabs?.map((t, j) => (
                                                                <li key={j} className="truncate" title={t.title}>{t.title}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs italic text-text-muted">No recent actions in memory.</p>
                                    )}
                                </div>

                                <div className="flex flex-col gap-4 min-h-[200px] max-h-[400px] overflow-y-auto pr-2 pb-2">
                                    {chatLog.length === 0 && (
                                        <div className="my-auto text-center opacity-40">
                                            <MessageSquare className="w-12 h-12 mx-auto mb-3" />
                                            <p className="text-sm">Explain common mistakes or new rules to the AI librarian.</p>
                                        </div>
                                    )}
                                    {chatLog.map((log, idx) => (
                                        <div key={idx} className={`flex ${log.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${log.sender === 'user'
                                                ? 'bg-text-primary text-bg-primary rounded-br-none'
                                                : 'bg-glass border border-glass text-text-primary rounded-bl-none backdrop-blur-md'
                                                }`}>
                                                {log.message}
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start">
                                            <div className="p-4 px-5 rounded-2xl bg-accent-soft rounded-bl-none flex gap-1.5 items-center">
                                                <div className="w-2 h-2 rounded-full animate-bounce bg-text-muted" />
                                                <div className="w-2 h-2 rounded-full animate-bounce bg-text-muted [animation-delay:150ms]" />
                                                <div className="w-2 h-2 rounded-full animate-bounce bg-text-muted [animation-delay:300ms]" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 pt-4 border-t border-glass">
                                    <input
                                        type="text"
                                        value={feedbackInput}
                                        onChange={(e) => setFeedbackInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && submitFeedback()}
                                        placeholder="Type your feedback here..."
                                        className="themed-input flex-1 px-5 py-4 text-sm rounded-2xl"
                                        disabled={chatLoading}
                                    />
                                    <button
                                        onClick={submitFeedback}
                                        disabled={chatLoading || !feedbackInput.trim()}
                                        className="btn-primary p-4 rounded-2xl disabled:opacity-30 transition-all shadow-lg"
                                    >
                                        <Send className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── ADVANCED PAGE ──────────────────────── */}
                {activeTab === 'advanced' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                        {/* Context-Aware Grouping (Non-LLM fast path) */}
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Eye className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Context Grouping</h2>
                            </div>
                            <p className="text-sm text-text-secondary mb-4">
                                Tabs join their opener's group automatically as you work — no AI call needed. Press <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--accent-soft)' }}>Alt+G</kbd> to group highlighted tabs (Cmd/Shift-click to multi-select first).
                            </p>
                            <div className="grid grid-cols-1 gap-3">
                                {([
                                    { key: 'contextInheritance' as const, label: 'Inherit opener\'s group', desc: 'New tabs opened from a link or "open in new tab" join the parent\'s group' },
                                    { key: 'activeTabFallback' as const, label: 'Cmd/Ctrl+T fallback', desc: 'Fresh new tabs inherit from the previously-active tab\'s group' },
                                    { key: 'focusActiveGroup' as const, label: 'Focus active group', desc: 'Auto-collapse other groups when you switch tabs (intrusive — opt in)' },
                                    { key: 'manualShortcut' as const, label: 'Alt+G shortcut', desc: 'Group selected tabs into a new group named after their dominant domain' },
                                    { key: 'includeIncognito' as const, label: 'Include incognito', desc: 'Apply context grouping in incognito windows' },
                                ]).map(item => (
                                    <label key={item.key} className="flex items-start gap-3 p-4 rounded-xl border border-glass cursor-pointer hover:bg-glass transition-all">
                                        <input
                                            type="checkbox"
                                            checked={contextConfig[item.key]}
                                            onChange={(e) => handleContextConfigChange(item.key, e.target.checked)}
                                            className="w-4 h-4 rounded mt-0.5"
                                        />
                                        <div>
                                            <span className="font-medium text-sm">{item.label}</span>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Popup Tab Visibility */}
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Eye className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Popup Tabs</h2>
                            </div>
                            <p className="text-sm text-text-secondary mb-4">Choose which tabs to show in the extension popup. At least one must be visible.</p>
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { key: 'showOrganize' as const, label: 'Organize', desc: 'AI tab grouping' },
                                    { key: 'showTools' as const, label: 'Tools', desc: 'Duplicates, collapse, undo, ungroup' },
                                    { key: 'showLearn' as const, label: 'Learn', desc: 'Correction learning' },
                                    { key: 'showWorkspaces' as const, label: 'Spaces', desc: 'Save & restore workspaces' },
                                    { key: 'showRules' as const, label: 'Rules', desc: 'Domain → group rules' },
                                ]).map(item => (
                                    <label key={item.key} className="flex items-start gap-3 p-4 rounded-xl border border-glass cursor-pointer hover:bg-glass transition-all">
                                        <input
                                            type="checkbox"
                                            checked={popupSettings[item.key]}
                                            onChange={(e) => handlePopupSettingChange(item.key, e.target.checked)}
                                            className="w-4 h-4 rounded mt-0.5"
                                        />
                                        <div>
                                            <span className="font-medium text-sm">{item.label}</span>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Templates */}
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Download className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Templates</h2>
                            </div>
                            <p className="text-sm text-text-secondary mb-6">
                                Export your SOUL, rules, and group settings as a shareable template. Import templates from others.
                            </p>

                            {templateStatus && (
                                <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium" style={{
                                    background: templateStatus.startsWith('Invalid') ? 'var(--danger-bg)' : 'var(--success-bg)',
                                    color: templateStatus.startsWith('Invalid') ? 'var(--danger)' : 'var(--success)',
                                }}>
                                    <CheckCircle className="w-4 h-4" />
                                    {templateStatus}
                                </div>
                            )}

                            {/* Import preview */}
                            {importPreview && (
                                <div className="mb-6 p-5 rounded-xl border border-glass" style={{ background: 'var(--accent-soft)' }}>
                                    <h3 className="font-semibold text-sm mb-3">Import: {importPreview.name}</h3>
                                    <div className="flex flex-col gap-1 text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                                        <p>{importPreview.rules.length} rules · {importPreview.groupConfigs.length} groups{importPreview.learnedPatterns ? ` · ${Object.keys(importPreview.learnedPatterns).length} patterns` : ''}</p>
                                        <p>SOUL: {importPreview.soul.substring(0, 120)}...</p>
                                        {importPreview.exportedAt && (
                                            <p style={{ color: 'var(--text-muted)' }}>Exported {new Date(importPreview.exportedAt).toLocaleDateString()}</p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-4 mb-4">
                                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                                            <input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} className="w-4 h-4" />
                                            Merge with existing
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                                            <input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} className="w-4 h-4" />
                                            Replace existing
                                        </label>
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={handleImportTemplate} className="btn-primary px-5 py-2.5 rounded-xl text-xs font-medium">
                                            Import Template
                                        </button>
                                        <button onClick={() => setImportPreview(null)} className="btn-ghost px-4 py-2.5 rounded-xl text-xs">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Export */}
                                <div className="p-5 rounded-xl border border-glass">
                                    <h3 className="font-medium text-sm mb-3">Export</h3>
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName(e.target.value)}
                                        placeholder="Template name (e.g. Developer Setup)"
                                        className="themed-input w-full px-4 py-3 rounded-xl text-sm mb-3"
                                    />
                                    <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm">
                                        <input
                                            type="checkbox"
                                            checked={templateIncludePatterns}
                                            onChange={(e) => setTemplateIncludePatterns(e.target.checked)}
                                            className="w-4 h-4 rounded"
                                        />
                                        Include learned patterns
                                    </label>
                                    <button onClick={handleExportTemplate} className="btn-primary w-full px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2">
                                        <Download className="w-4 h-4" /> Export as JSON
                                    </button>
                                </div>

                                {/* Import */}
                                <div className="p-5 rounded-xl border border-glass">
                                    <h3 className="font-medium text-sm mb-3">Import</h3>
                                    <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                                        Load a .json template file to import SOUL, rules, and group settings.
                                    </p>
                                    <button onClick={handleImportFile} className="btn-ghost w-full px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 border border-glass">
                                        <Upload className="w-4 h-4" /> Choose Template File
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Sync */}
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <RefreshCw className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Cross-Device Sync</h2>
                            </div>
                            <p className="text-sm text-text-secondary mb-6">
                                Sync your SOUL, rules, and group settings across devices using Chrome Sync. Workspaces stay local.
                            </p>

                            {syncStatus && (
                                <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium" style={{
                                    background: syncStatus.startsWith('Error') ? 'var(--danger-bg)' : 'var(--success-bg)',
                                    color: syncStatus.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                                }}>
                                    <CheckCircle className="w-4 h-4" />
                                    {syncStatus}
                                </div>
                            )}

                            <label className="flex items-center justify-between p-4 rounded-xl border border-glass mb-4 cursor-pointer hover:bg-glass transition-all">
                                <div>
                                    <span className="font-medium text-sm">Enable sync</span>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        Automatically sync settings when you change them
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={syncConfig.enabled}
                                    onChange={(e) => handleSyncConfigChange({ enabled: e.target.checked })}
                                    className="w-5 h-5 rounded"
                                />
                            </label>

                            {syncConfig.enabled && (
                                <div className="flex flex-col gap-3">
                                    <div className="grid grid-cols-3 gap-3">
                                        {([
                                            { key: 'syncSoul' as const, label: 'SOUL' },
                                            { key: 'syncRules' as const, label: 'Rules' },
                                            { key: 'syncGroups' as const, label: 'Groups' },
                                        ]).map(item => (
                                            <label key={item.key} className="flex items-center gap-2 p-3 rounded-xl border border-glass cursor-pointer hover:bg-glass transition-all text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={syncConfig[item.key]}
                                                    onChange={(e) => handleSyncConfigChange({ [item.key]: e.target.checked })}
                                                    className="w-4 h-4 rounded"
                                                />
                                                {item.label}
                                            </label>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            {syncConfig.lastSyncedAt
                                                ? `Last synced: ${new Date(syncConfig.lastSyncedAt).toLocaleString()}`
                                                : 'Never synced'}
                                        </p>
                                        <button
                                            onClick={handleSyncNow}
                                            disabled={syncing}
                                            className="btn-primary px-5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 disabled:opacity-40"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                            {syncing ? 'Syncing...' : 'Sync Now'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <Type className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                    <h2 className="text-xl font-semibold tracking-tight">SOUL.md Truth Source</h2>
                                </div>
                                <button onClick={handleSaveSoul} className="btn-primary px-5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                                    <Save className="w-4 h-4" /> Save Changes
                                </button>
                            </div>
                            <p className="text-sm text-text-secondary mb-4">The core system prompt and classification rules for the AI.</p>
                            <textarea
                                className="themed-input w-full h-[400px] p-6 font-mono text-sm rounded-2xl resize-none"
                                value={soulText}
                                onChange={(e) => setSoulText(e.target.value)}
                                spellCheck={false}
                            />
                            {learningStatus && (
                                <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                    <CheckCircle className="w-4 h-4" />
                                    {learningStatus}
                                </div>
                            )}
                        </div>

                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <Link className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                    <h2 className="text-xl font-semibold tracking-tight">Learned Patterns</h2>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={importLearnedJson} className="bg-glass hover:bg-glass-hover text-text-primary px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-glass transition-all">
                                        <Upload className="w-4 h-4" /> Import
                                    </button>
                                    <button onClick={exportLearnedJson} className="bg-glass hover:bg-glass-hover text-text-primary px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-glass transition-all">
                                        <Download className="w-4 h-4" /> Export
                                    </button>
                                    <button onClick={clearLearned} className="bg-danger-bg text-danger px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all">
                                        <RefreshCw className="w-4 h-4" /> Reset
                                    </button>
                                </div>
                            </div>
                            <pre className="w-full p-6 h-64 overflow-auto font-mono text-sm rounded-2xl bg-code-bg text-code-text">
                                {learnedJson}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
