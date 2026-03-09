import { useState, useEffect } from 'react';
import { Key, BookOpen, CheckCircle, BrainCircuit, RefreshCw, Upload, Download, Save, Link, Type, MessageSquare, Send, Settings, Cpu, Database, X, LayoutGrid } from 'lucide-react';
import { getLearnedPatterns, getSoulText, saveLearnedPatterns, saveSoulText } from '../lib/learningEngine';
import { LastAction, AIConfig, AIProvider, GroupConfig, GroupPermission } from '../types';

const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
    claude: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest' },
    groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-3.5-turbo' },
    custom: { baseUrl: '', model: '' }
};

export default function Options() {
    const [activeTab, setActiveTab] = useState<'model' | 'groups' | 'feedback' | 'advanced'>('model');
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
    }, []);

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
                <TabButton id="feedback" label="Feedback" icon={MessageSquare} />
                <TabButton id="advanced" label="Advanced" icon={Settings} />
            </div>

            <div className="flex flex-col gap-6">

                {/* ─── GROUPS PAGE ──────────────────────── */}
                {activeTab === 'groups' && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="glass-card rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <LayoutGrid className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                <h2 className="text-xl font-semibold tracking-tight">Group Permissions</h2>
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
