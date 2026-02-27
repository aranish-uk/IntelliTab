import { useState, useEffect } from 'react';
import { Sparkles, Save, CheckCircle2, Settings } from 'lucide-react';
import { GroqResponse } from '../types';

export default function Popup() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<GroqResponse | null>(null);
    const [activeTab, setActiveTab] = useState<'organize' | 'rules'>('organize');
    const [rulesSource, setRulesSource] = useState('[]');
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        chrome.storage.local.get(['rules'], (data) => {
            if (data.rules) {
                setRulesSource(JSON.stringify(data.rules, null, 2));
            }
        });
    }, []);

    const analyzeTabs = () => {
        setLoading(true);
        setError('');
        setResult(null);
        chrome.runtime.sendMessage({ action: 'analyzeTabs' }, (response) => {
            setLoading(false);
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
            if (response && response.error) {
                setError(response.error);
                if (response.error.includes("Groq API Key")) {
                    setError("Please set your Groq API Key in the Options page.");
                }
            } else if (response) {
                setResult(response);
            } else {
                setError("Unknown error communicating with standard background service.");
            }
        });
    };

    const applyGroups = () => {
        if (!result || result.groups.length === 0) return;
        chrome.runtime.sendMessage({ action: 'groupTabs', groups: result.groups }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
            if (response && response.error) {
                setError(response.error);
            } else {
                setResult(null);
            }
        });
    };

    const openOptions = () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    };

    const saveRules = () => {
        try {
            const parsed = JSON.parse(rulesSource);
            chrome.storage.local.set({ rules: parsed }, () => {
                setSaveStatus('Saved!');
                setTimeout(() => setSaveStatus(''), 2000);
            });
        } catch (e: any) {
            setSaveStatus('Invalid JSON');
            setTimeout(() => setSaveStatus(''), 2000);
        }
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Header */}
            <header className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-glass)' }}>
                <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                    <Sparkles className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    IntelliTab
                </h1>
                <button
                    onClick={openOptions}
                    className="p-2 rounded-lg transition-all"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Settings"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </header>

            {/* Tab Switcher */}
            <div className="flex px-5 gap-1 pt-2" style={{ borderBottom: '1px solid var(--border-glass)' }}>
                <button
                    className="flex-1 pb-3 text-xs font-medium tracking-wide uppercase transition-all"
                    style={{
                        color: activeTab === 'organize' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        borderBottom: activeTab === 'organize' ? '2px solid var(--text-primary)' : '2px solid transparent'
                    }}
                    onClick={() => setActiveTab('organize')}
                >
                    Organize
                </button>
                <button
                    className="flex-1 pb-3 text-xs font-medium tracking-wide uppercase transition-all"
                    style={{
                        color: activeTab === 'rules' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        borderBottom: activeTab === 'rules' ? '2px solid var(--text-primary)' : '2px solid transparent'
                    }}
                    onClick={() => setActiveTab('rules')}
                >
                    Rules
                </button>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden p-5 flex flex-col items-center">
                {activeTab === 'organize' ? (
                    <div className="w-full flex-1 flex flex-col" style={{ height: '100%' }}>
                        {!result && !loading && (
                            <div className="my-auto text-center flex flex-col items-center justify-center gap-5">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                                    <Sparkles className="w-7 h-7" style={{ color: 'var(--text-tertiary)' }} />
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold">Ready to organize?</h2>
                                    <p className="text-xs mt-1 max-w-[240px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        Let AI analyze and sort your open tabs into logical groups.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2 w-full">
                                    <button
                                        onClick={analyzeTabs}
                                        className="btn-primary w-full py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Analyze Tabs
                                    </button>
                                    <button
                                        onClick={() => chrome.runtime.sendMessage({ action: 'ungroupAll' })}
                                        className="btn-ghost w-full py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1"
                                    >
                                        Ungroup All
                                    </button>
                                </div>
                            </div>
                        )}

                        {loading && (
                            <div className="my-auto text-center flex flex-col items-center justify-center gap-4 h-full">
                                <div
                                    className="w-8 h-8 rounded-full animate-spin"
                                    style={{ border: '3px solid var(--spinner-track)', borderTopColor: 'var(--spinner-fill)' }}
                                />
                                <p className="text-xs font-medium animate-pulse" style={{ color: 'var(--text-tertiary)' }}>
                                    Analyzing your tabs...
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--border-glass)' }}>
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        {result && !loading && (
                            <div className="w-full flex flex-col gap-4">
                                <div className="glass-card rounded-xl p-4">
                                    <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                                        Suggested Groups
                                    </h3>
                                    {result.groups.length === 0 ? (
                                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No logical groups found.</p>
                                    ) : (
                                        <ul className="flex flex-col gap-1.5 mb-4">
                                            {result.groups.map((g, i) => (
                                                <li key={i} className="flex justify-between items-center p-2.5 px-3 rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                                                    <span className="font-medium text-xs">{g.groupName}</span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--badge-bg)', color: 'var(--badge-text)' }}>
                                                        {g.tabIds.length}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {result.groups.length > 0 && (
                                        <button
                                            onClick={applyGroups}
                                            className="btn-primary w-full py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2"
                                        >
                                            Apply Grouping
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => setResult(null)}
                                    className="text-xs mx-auto"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="w-full flex flex-col h-full glass-card rounded-xl p-4">
                        <h2 className="font-medium text-sm mb-1">Rules Engine</h2>
                        <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                            Configure domain → group mappings.
                        </p>
                        <textarea
                            className="themed-input w-full flex-1 p-3 min-h-[250px] text-xs font-mono rounded-lg resize-none"
                            value={rulesSource}
                            onChange={(e) => setRulesSource(e.target.value)}
                            spellCheck={false}
                        />
                        <div className="mt-3 flex justify-between items-center">
                            <span className="text-xs font-medium" style={{ color: saveStatus === 'Saved!' ? 'var(--success)' : 'var(--danger)' }}>
                                {saveStatus}
                            </span>
                            <button
                                onClick={saveRules}
                                className="btn-primary text-xs py-2 px-4 rounded-lg flex items-center gap-2"
                            >
                                <Save className="w-3.5 h-3.5" /> Save Rules
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
