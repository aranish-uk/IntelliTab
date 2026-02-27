import { useState, useEffect } from 'react';
import { Key, BookOpen, CheckCircle, ChevronDown, ChevronUp, BrainCircuit, RefreshCw, Upload, Download, Save, Link, Type, MessageSquare, Send } from 'lucide-react';
import { getLearnedPatterns, getSoulText, saveLearnedPatterns, saveSoulText } from '../lib/learningEngine';
import { LastAction } from '../types';

export default function Options() {
    const [apiKey, setApiKey] = useState('');
    const [status, setStatus] = useState('');
    const [showInstructions, setShowInstructions] = useState(false);
    const [showLearning, setShowLearning] = useState(false);

    const [soulText, setSoulText] = useState('');
    const [learnedJson, setLearnedJson] = useState('{}');
    const [learningStatus, setLearningStatus] = useState('');

    const [showChat, setShowChat] = useState(true);
    const [feedbackInput, setFeedbackInput] = useState('');
    const [chatLog, setChatLog] = useState<{ sender: 'user' | 'ai', message: string }[]>([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [lastAction, setLastAction] = useState<LastAction | null>(null);

    useEffect(() => {
        chrome.storage.local.get(['groqApiKey', 'lastAction'], (result) => {
            if (result.groqApiKey) setApiKey(result.groqApiKey);
            if (result.lastAction) setLastAction(result.lastAction);
        });

        const loadData = async () => {
            const p = await getLearnedPatterns();
            setLearnedJson(JSON.stringify(p, null, 2));
            const s = await getSoulText();
            setSoulText(s);
        };
        loadData();
    }, []);

    const handleSaveAPI = () => {
        chrome.storage.local.set({ groqApiKey: apiKey }, () => {
            setStatus('API Key saved successfully!');
            setTimeout(() => setStatus(''), 3000);
        });
    };

    const handleSaveSoul = async () => {
        await saveSoulText(soulText);
        setLearningStatus('SOUL updated!');
        setTimeout(() => setLearningStatus(''), 3000);
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

    /* Reusable section toggle button */
    const SectionHeader = ({ icon: Icon, title, isOpen, toggle }: { icon: any, title: string, isOpen: boolean, toggle: () => void }) => (
        <button
            onClick={toggle}
            className="w-full flex justify-between items-center p-5 transition-all rounded-t-xl"
            style={{ color: 'var(--text-primary)' }}
        >
            <div className="flex items-center gap-3">
                <Icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
        </button>
    );

    return (
        <div className="max-w-3xl mx-auto px-6 py-10 pb-20" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>
            {/* Page Header */}
            <div className="mb-10 text-center flex flex-col items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <BrainCircuit className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
                    IntelliTab
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>AI-powered tab organizer & memory core</p>
            </div>

            <div className="flex flex-col gap-4">

                {/* ─── AI Feedback Chat ──────────────────────── */}
                <div className="glass-card rounded-xl overflow-hidden">
                    <SectionHeader icon={MessageSquare} title="Feedback & AI Retraining" isOpen={showChat} toggle={() => setShowChat(!showChat)} />

                    {showChat && (
                        <div className="p-6 flex flex-col gap-5" style={{ borderTop: '1px solid var(--border-glass)' }}>
                            {/* Last Action Memory */}
                            <div className="glass-card-solid rounded-lg p-4">
                                <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>
                                    Memory: Last Action
                                </h3>
                                {lastAction ? (
                                    <div className="text-xs max-h-56 overflow-y-auto pr-2" style={{ color: 'var(--text-secondary)' }}>
                                        <p className="mb-2">Organized {lastAction.tabsOrganized} tabs.</p>
                                        <div className="flex flex-col gap-2">
                                            {lastAction.groupsCreated.map((g, i) => (
                                                <div key={i} className="p-2.5 rounded-md" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border-glass)' }}>
                                                    <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                                        {g.groupName} <span style={{ color: 'var(--text-muted)' }}>({g.tabCount})</span>
                                                    </div>
                                                    <ul className="list-disc list-inside ml-1 flex flex-col gap-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                                        {g.tabs?.map((t, j) => (
                                                            <li key={j} className="truncate" title={t.title}>
                                                                {t.title} <span style={{ color: 'var(--text-muted)' }}>({t.domain})</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                        {lastAction.groupsCreated.length === 0 && <p className="italic" style={{ color: 'var(--text-muted)' }}>No groups were created.</p>}
                                    </div>
                                ) : (
                                    <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No recent actions. Organize tabs from the popup first.</p>
                                )}
                            </div>

                            {/* Chat Log */}
                            <div className="flex flex-col gap-2.5 max-h-[280px] overflow-y-auto pr-2 pb-2">
                                {chatLog.length === 0 && (
                                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                                        Tell the AI what it got wrong, or ask it why it grouped something a certain way.
                                    </p>
                                )}
                                {chatLog.map((log, idx) => (
                                    <div key={idx} className={`flex ${log.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className="max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed"
                                            style={log.sender === 'user' ? {
                                                background: 'var(--accent)',
                                                color: 'var(--bg-primary)',
                                                borderBottomRightRadius: '4px'
                                            } : {
                                                background: 'var(--bg-glass)',
                                                border: '1px solid var(--border-glass)',
                                                color: 'var(--text-primary)',
                                                borderBottomLeftRadius: '4px',
                                                backdropFilter: 'blur(12px)'
                                            }}
                                        >
                                            {log.message}
                                        </div>
                                    </div>
                                ))}
                                {chatLoading && (
                                    <div className="flex justify-start">
                                        <div className="p-3 px-4 rounded-2xl flex gap-1.5 items-center" style={{ background: 'var(--accent-soft)', borderBottomLeftRadius: '4px' }}>
                                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)' }} />
                                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '150ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Chat Input */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={feedbackInput}
                                    onChange={(e) => setFeedbackInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submitFeedback()}
                                    placeholder="e.g. Why did you put YouTube in Study?"
                                    className="themed-input flex-1 px-4 py-3 text-xs rounded-xl"
                                    disabled={chatLoading}
                                />
                                <button
                                    onClick={submitFeedback}
                                    disabled={chatLoading || !feedbackInput.trim()}
                                    className="btn-primary p-3 rounded-xl disabled:opacity-30 transition-all"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── API Key ──────────────────────── */}
                <div className="glass-card rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Key className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                        <h2 className="text-base font-semibold tracking-tight">Groq API Key</h2>
                    </div>
                    <div className="flex gap-3 items-center">
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="gsk_..."
                            className="themed-input flex-1 px-4 py-3 rounded-lg text-sm"
                        />
                        <button onClick={handleSaveAPI} className="btn-primary px-5 py-3 rounded-lg text-sm">
                            Save
                        </button>
                    </div>
                    {status && (
                        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                            <CheckCircle className="w-4 h-4" />
                            {status}
                        </div>
                    )}
                </div>

                {/* ─── How To ──────────────────────── */}
                <div className="glass-card rounded-xl overflow-hidden">
                    <SectionHeader icon={BookOpen} title="How to get a Key" isOpen={showInstructions} toggle={() => setShowInstructions(!showInstructions)} />
                    {showInstructions && (
                        <div className="p-6 text-xs flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                            <p>1. Go to <strong>console.groq.com</strong> and sign up</p>
                            <p>2. Navigate to <strong>API Keys</strong> in the sidebar</p>
                            <p>3. Generate a new key and paste it above</p>
                        </div>
                    )}
                </div>

                {/* ─── Learning Engine & SOUL ──────────────────────── */}
                <div className="glass-card rounded-xl overflow-hidden">
                    <SectionHeader icon={BrainCircuit} title="Learning Engine & SOUL" isOpen={showLearning} toggle={() => setShowLearning(!showLearning)} />

                    {showLearning && (
                        <div className="p-6 flex flex-col gap-6" style={{ borderTop: '1px solid var(--border-glass)' }}>

                            {learningStatus && (
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                    <CheckCircle className="w-4 h-4" />
                                    {learningStatus}
                                </div>
                            )}

                            {/* SOUL.md Editor */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Type className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                                        SOUL.md Truth Source
                                    </h3>
                                    <button onClick={handleSaveSoul} className="btn-ghost px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5">
                                        <Save className="w-3.5 h-3.5" /> Save
                                    </button>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Core behavioral instructions for the AI classifier.</p>
                                <textarea
                                    className="themed-input w-full h-52 p-4 font-mono text-xs rounded-lg resize-y"
                                    value={soulText}
                                    onChange={(e) => setSoulText(e.target.value)}
                                    spellCheck={false}
                                />
                            </div>

                            {/* Learned Patterns */}
                            <div className="flex flex-col gap-2 pt-4" style={{ borderTop: '1px solid var(--border-glass)' }}>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Link className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                                        Learned Patterns
                                    </h3>
                                    <div className="flex gap-1.5">
                                        <button onClick={importLearnedJson} className="btn-ghost px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1.5">
                                            <Upload className="w-3.5 h-3.5" /> Import
                                        </button>
                                        <button onClick={exportLearnedJson} className="btn-ghost px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1.5">
                                            <Download className="w-3.5 h-3.5" /> Export
                                        </button>
                                        <button onClick={clearLearned} className="px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-all" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}>
                                            <RefreshCw className="w-3.5 h-3.5" /> Reset
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Auto-tracked domain → group weights.</p>
                                <pre className="w-full p-4 h-44 overflow-auto font-mono text-xs rounded-lg" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>
                                    {learnedJson}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
