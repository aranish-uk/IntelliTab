import { useState, useEffect } from 'react';
import { Sparkles, Save, CheckCircle2, Settings, FolderOpen, ChevronDown, ChevronRight, Trash2, RotateCcw, Archive, AlertCircle, ThumbsUp, ArrowRight } from 'lucide-react';
import { AIResponse, Workspace, CorrectionDiff } from '../types';

export default function Popup() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<AIResponse | null>(null);
    const [activeTab, setActiveTab] = useState<'organize' | 'learn' | 'workspaces' | 'rules'>('organize');
    const [rulesSource, setRulesSource] = useState('[]');
    const [saveStatus, setSaveStatus] = useState('');
    const [ungroupedOnly, setUngroupedOnly] = useState(false);

    // Workspace state
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [expandedWs, setExpandedWs] = useState<string | null>(null);
    const [wsName, setWsName] = useState('');
    const [wsLoading, setWsLoading] = useState(false);
    const [wsMessage, setWsMessage] = useState('');
    const [closeAfterSave, setCloseAfterSave] = useState(false);
    const [mergeExisting, setMergeExisting] = useState(true);
    const [recoveryAvailable, setRecoveryAvailable] = useState(false);

    // Learn state (corrections)
    const [learnLoading, setLearnLoading] = useState(false);
    const [learnResult, setLearnResult] = useState<{
        diff: CorrectionDiff;
        analysis: { summary: string; soulSuggestions?: string } | null;
        patternsUpdated: number;
    } | null>(null);
    const [learnError, setLearnError] = useState('');

    // Learn state ("this is how I like it" — from current state)
    const [likeItLoading, setLikeItLoading] = useState(false);
    const [likeItResult, setLikeItResult] = useState<{
        groupsLearned: number;
        patternsLearned: number;
        groupNames: string[];
    } | null>(null);
    const [likeItError, setLikeItError] = useState('');

    useEffect(() => {
        chrome.storage.local.get(['rules'], (data) => {
            if (data.rules) {
                setRulesSource(JSON.stringify(data.rules, null, 2));
            }
        });
        loadWorkspaces();
        checkRecovery();
    }, []);

    const loadWorkspaces = () => {
        chrome.runtime.sendMessage({ action: 'getWorkspaces' }, (response) => {
            if (response && response.workspaces) {
                setWorkspaces(response.workspaces);
            }
        });
    };

    const checkRecovery = () => {
        chrome.runtime.sendMessage({ action: 'checkRecovery' }, (response) => {
            if (response && response.recoveryAvailable) {
                setRecoveryAvailable(true);
            }
        });
    };

    const analyzeTabs = () => {
        setLoading(true);
        setError('');
        setResult(null);
        chrome.runtime.sendMessage({ action: 'analyzeTabs', ungroupedOnly }, (response) => {
            setLoading(false);
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
            if (response && response.error) {
                setError(response.error);
                if (response.error.toLowerCase().includes("api key")) {
                    setError("Please set your API Key in the Options page.");
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

    // ── Workspace actions ──

    const handleSaveWorkspace = () => {
        const name = wsName.trim();
        if (!name) return;
        setWsLoading(true);
        setWsMessage('');

        const action = closeAfterSave ? 'saveAndCloseWorkspace' : 'saveWorkspace';
        chrome.runtime.sendMessage({ action, name }, (response) => {
            setWsLoading(false);
            if (response?.error) {
                setWsMessage(`Error: ${response.error}`);
            } else {
                const msg = closeAfterSave
                    ? `Saved & closed ${response.tabsClosed || 0} tabs`
                    : 'Workspace saved';
                setWsMessage(msg);
                setWsName('');
                loadWorkspaces();
            }
            setTimeout(() => setWsMessage(''), 3000);
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
            setTimeout(() => setWsMessage(''), 3000);
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
            setTimeout(() => setWsMessage(''), 3000);
        });
    };

    const handleDeleteWorkspace = (id: string) => {
        chrome.runtime.sendMessage({ action: 'deleteWorkspace', workspaceId: id }, (response) => {
            if (!response?.error) {
                loadWorkspaces();
                if (expandedWs === id) setExpandedWs(null);
            }
        });
    };

    const handleRestoreSnapshot = () => {
        setWsLoading(true);
        chrome.runtime.sendMessage({ action: 'restoreAutoSnapshot', mergeExisting }, (response) => {
            setWsLoading(false);
            setRecoveryAvailable(false);
            if (response?.error) {
                setWsMessage(`Error: ${response.error}`);
            } else {
                setWsMessage(`Recovered ${response.groupsRestored} groups (${response.tabsRestored} tabs)`);
            }
            setTimeout(() => setWsMessage(''), 3000);
        });
    };

    const handleDismissRecovery = () => {
        chrome.runtime.sendMessage({ action: 'dismissRecovery' });
        setRecoveryAvailable(false);
    };

    const colorDot: Record<string, string> = {
        blue: '#4285f4', red: '#ea4335', yellow: '#fbbc04', green: '#34a853',
        pink: '#ff6d93', purple: '#a142f4', cyan: '#24c1e0', orange: '#fa903e', grey: '#9aa0a6',
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
                {(['organize', 'learn', 'workspaces', 'rules'] as const).map(tab => {
                    const labels: Record<string, string> = { organize: 'Organize', learn: 'Learn', workspaces: 'Spaces', rules: 'Rules' };
                    return (
                        <button
                            key={tab}
                            className="flex-1 pb-3 text-xs font-medium tracking-wide uppercase transition-all"
                            style={{
                                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                borderBottom: activeTab === tab ? '2px solid var(--text-primary)' : '2px solid transparent'
                            }}
                            onClick={() => setActiveTab(tab)}
                        >
                            {labels[tab]}
                        </button>
                    );
                })}
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-5 flex flex-col items-center">

                {/* ── ORGANIZE TAB ── */}
                {activeTab === 'organize' && (
                    <div className="w-full flex-1 flex flex-col">
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

                                <label className="flex items-center justify-center gap-2 mt-2 mb-1 px-1 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={ungroupedOnly}
                                        onChange={(e) => setUngroupedOnly(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded-sm border-gray-400 bg-transparent"
                                    />
                                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                        Only organize ungrouped tabs
                                    </span>
                                </label>

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
                )}

                {/* ── LEARN TAB ── */}
                {activeTab === 'learn' && (
                    <div className="w-full flex-1 flex flex-col">
                        {!learnResult && !learnLoading && (
                            <div className="my-auto text-center flex flex-col items-center justify-center gap-5">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                                    <ThumbsUp className="w-7 h-7" style={{ color: 'var(--text-tertiary)' }} />
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold">This is how I like it</h2>
                                    <p className="text-xs mt-1 max-w-[260px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        After AI organizes your tabs, make any corrections you want, then click below. IntelliTab will learn from your changes.
                                    </p>
                                </div>

                                {/* Error shown inline above button */}
                                {learnError && (
                                    <div className="w-full p-3 rounded-xl text-xs text-left" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--border-glass)' }}>
                                        <strong>Error:</strong> {learnError}
                                    </div>
                                )}

                                <div className="w-full flex flex-col gap-2">
                                    <button
                                        onClick={() => {
                                            setLearnLoading(true);
                                            setLearnError('');
                                            setLearnResult(null);
                                            chrome.runtime.sendMessage({ action: 'learnFromCorrections' }, (response) => {
                                                setLearnLoading(false);
                                                if (chrome.runtime.lastError) {
                                                    setLearnError(`Service worker error: ${chrome.runtime.lastError.message}. Try again.`);
                                                    return;
                                                }
                                                if (!response) {
                                                    setLearnError('No response from background. The extension may need reloading.');
                                                    return;
                                                }
                                                if (response.error) {
                                                    setLearnError(response.error);
                                                    return;
                                                }
                                                if (response.diff) {
                                                    setLearnResult(response);
                                                } else {
                                                    setLearnError('Unexpected response format. Please try again.');
                                                }
                                            });
                                        }}
                                        className="btn-primary w-full py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2"
                                    >
                                        <ThumbsUp className="w-4 h-4" />
                                        Learn from my corrections
                                    </button>

                                    <p className="text-xs text-center mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Compares your current tabs to the last AI grouping
                                    </p>

                                    {/* Divider */}
                                    <div className="flex items-center gap-3 my-1">
                                        <div className="flex-1 h-px" style={{ background: 'var(--border-glass)' }} />
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
                                        <div className="flex-1 h-px" style={{ background: 'var(--border-glass)' }} />
                                    </div>

                                    {/* "This is how I like it" — learn from current groups directly */}
                                    <button
                                        onClick={() => {
                                            setLikeItLoading(true);
                                            setLikeItError('');
                                            setLikeItResult(null);
                                            chrome.runtime.sendMessage({ action: 'learnFromCurrentState' }, (response) => {
                                                setLikeItLoading(false);
                                                if (chrome.runtime.lastError) {
                                                    setLikeItError(`Service worker error: ${chrome.runtime.lastError.message}. Try again.`);
                                                    return;
                                                }
                                                if (!response) {
                                                    setLikeItError('No response from background. The extension may need reloading.');
                                                    return;
                                                }
                                                if (response.error) {
                                                    setLikeItError(response.error);
                                                    return;
                                                }
                                                setLikeItResult(response);
                                            });
                                        }}
                                        disabled={likeItLoading}
                                        className="btn-ghost w-full py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-40"
                                    >
                                        {likeItLoading ? (
                                            <>
                                                <div className="w-3 h-3 rounded-full animate-spin" style={{ border: '2px solid var(--spinner-track)', borderTopColor: 'var(--spinner-fill)' }} />
                                                Learning...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                This is how I like my tabs
                                            </>
                                        )}
                                    </button>

                                    <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                                        Learns from your current groups — no AI run needed
                                    </p>

                                    {/* Like-it error */}
                                    {likeItError && (
                                        <div className="w-full p-2.5 rounded-lg text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--border-glass)' }}>
                                            {likeItError}
                                        </div>
                                    )}

                                    {/* Like-it success */}
                                    {likeItResult && (
                                        <div className="w-full p-3 rounded-xl text-xs" style={{ background: 'var(--success-bg)', border: '1px solid var(--border-glass)' }}>
                                            <p className="font-medium flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Learned from {likeItResult.groupsLearned} groups
                                            </p>
                                            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                                                {likeItResult.patternsLearned} domain patterns saved from: {likeItResult.groupNames.join(', ')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {learnLoading && (
                            <div className="my-auto text-center flex flex-col items-center justify-center gap-4 h-full">
                                <div
                                    className="w-8 h-8 rounded-full animate-spin"
                                    style={{ border: '3px solid var(--spinner-track)', borderTopColor: 'var(--spinner-fill)' }}
                                />
                                <p className="text-xs font-medium animate-pulse" style={{ color: 'var(--text-tertiary)' }}>
                                    Analyzing your corrections...
                                </p>
                            </div>
                        )}

                        {learnResult && !learnLoading && (
                            <div className="w-full flex flex-col gap-3 mt-1">
                                {/* Summary */}
                                <div className="glass-card rounded-xl p-4">
                                    <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                                        Learning Complete
                                    </h3>
                                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        {learnResult.analysis?.summary || `Updated ${learnResult.patternsUpdated} patterns.`}
                                    </p>
                                </div>

                                {/* Tab corrections */}
                                {learnResult.diff.tabCorrections.length > 0 && (
                                    <div className="glass-card rounded-xl p-4">
                                        <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
                                            TAB CORRECTIONS ({learnResult.diff.tabCorrections.length})
                                        </h4>
                                        <ul className="flex flex-col gap-1.5">
                                            {learnResult.diff.tabCorrections.slice(0, 10).map((c, i) => (
                                                <li key={i} className="flex items-center gap-1.5 text-xs p-2 rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                                                    <span className="truncate flex-1" title={c.url}>{c.title || c.domain}</span>
                                                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                                                        {c.fromGroup}
                                                    </span>
                                                    <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                                                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                                        {c.toGroup}
                                                    </span>
                                                </li>
                                            ))}
                                            {learnResult.diff.tabCorrections.length > 10 && (
                                                <li className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    + {learnResult.diff.tabCorrections.length - 10} more
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}

                                {/* Group renames */}
                                {learnResult.diff.groupRenames.length > 0 && (
                                    <div className="glass-card rounded-xl p-4">
                                        <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
                                            GROUP RENAMES ({learnResult.diff.groupRenames.length})
                                        </h4>
                                        <ul className="flex flex-col gap-1.5">
                                            {learnResult.diff.groupRenames.map((r, i) => (
                                                <li key={i} className="flex items-center gap-1.5 text-xs p-2 rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                                                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                                                        {r.oldName}
                                                    </span>
                                                    <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                                                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                                        {r.newName}
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)' }}>({r.tabCount} tabs)</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* SOUL suggestions */}
                                {learnResult.analysis?.soulSuggestions && (
                                    <div className="glass-card rounded-xl p-4">
                                        <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
                                            SOUL AMENDED
                                        </h4>
                                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                            {learnResult.analysis.soulSuggestions}
                                        </p>
                                    </div>
                                )}

                                {/* No corrections detected */}
                                {learnResult.diff.tabCorrections.length === 0 && learnResult.diff.groupRenames.length === 0 && (
                                    <div className="text-center py-4">
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            No changes detected — your tabs match the AI's grouping.
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={() => { setLearnResult(null); setLearnError(''); }}
                                    className="text-xs mx-auto mt-1"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── WORKSPACES TAB ── */}
                {activeTab === 'workspaces' && (
                    <div className="w-full flex flex-col gap-4">

                        {/* Recovery banner */}
                        {recoveryAvailable && (
                            <div className="p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'var(--success-bg)', border: '1px solid var(--border-glass)' }}>
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                                <div className="flex-1">
                                    <p className="font-medium" style={{ color: 'var(--success)' }}>Groups lost after restart?</p>
                                    <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>IntelliTab has a snapshot of your last session.</p>
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={handleRestoreSnapshot} className="btn-primary px-3 py-1.5 rounded-lg text-xs">
                                            Restore
                                        </button>
                                        <button onClick={handleDismissRecovery} className="btn-ghost px-3 py-1.5 rounded-lg text-xs">
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save workspace */}
                        <div className="glass-card rounded-xl p-4">
                            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                                <Archive className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                                Save Workspace
                            </h3>
                            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                                Snapshot all current tab groups into a named workspace.
                            </p>
                            <div className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={wsName}
                                    onChange={(e) => setWsName(e.target.value)}
                                    placeholder="Workspace name (e.g. Masters)"
                                    className="themed-input flex-1 px-3 py-2 rounded-lg text-xs"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveWorkspace()}
                                />
                                <button
                                    onClick={handleSaveWorkspace}
                                    disabled={!wsName.trim() || wsLoading}
                                    className="btn-primary px-3 py-2 rounded-lg text-xs disabled:opacity-40"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={closeAfterSave}
                                        onChange={(e) => setCloseAfterSave(e.target.checked)}
                                        className="w-3 h-3 rounded-sm"
                                    />
                                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Close after save</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={mergeExisting}
                                        onChange={(e) => setMergeExisting(e.target.checked)}
                                        className="w-3 h-3 rounded-sm"
                                    />
                                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Merge on restore</span>
                                </label>
                            </div>
                        </div>

                        {/* Status message */}
                        {wsMessage && (
                            <div className="px-3 py-2 rounded-lg text-xs font-medium" style={{
                                background: wsMessage.startsWith('Error') ? 'var(--danger-bg)' : 'var(--success-bg)',
                                color: wsMessage.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                            }}>
                                {wsMessage}
                            </div>
                        )}

                        {/* Saved workspaces list */}
                        {workspaces.length === 0 ? (
                            <div className="text-center py-8">
                                <FolderOpen className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No saved workspaces yet</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {workspaces.map(ws => (
                                    <div key={ws.id} className="glass-card rounded-xl overflow-hidden">
                                        {/* Workspace header */}
                                        <div
                                            className="flex items-center gap-2 p-3 cursor-pointer"
                                            onClick={() => setExpandedWs(expandedWs === ws.id ? null : ws.id)}
                                        >
                                            {expandedWs === ws.id
                                                ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                                : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                            }
                                            <span className="font-medium text-xs flex-1 truncate">{ws.name}</span>
                                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--badge-bg)', color: 'var(--badge-text)' }}>
                                                {ws.groups.length} groups
                                            </span>
                                        </div>

                                        {/* Expanded: show groups + actions */}
                                        {expandedWs === ws.id && (
                                            <div className="px-3 pb-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-glass)' }}>
                                                {/* Groups list */}
                                                <div className="flex flex-col gap-1 mt-2">
                                                    {ws.groups.map(g => (
                                                        <div key={g.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                                                            <div
                                                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                style={{ background: colorDot[g.color] || colorDot.grey }}
                                                            />
                                                            <span className="text-xs flex-1 truncate">{g.name}</span>
                                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                                {g.tabs.length}
                                                            </span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRestoreGroup(ws.id, g.id); }}
                                                                className="p-1 rounded hover:bg-glass-hover transition-all"
                                                                title="Restore this group"
                                                            >
                                                                <RotateCcw className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Workspace actions */}
                                                <div className="flex gap-2 mt-1">
                                                    <button
                                                        onClick={() => handleRestoreWorkspace(ws.id)}
                                                        disabled={wsLoading}
                                                        className="btn-primary flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        Restore All
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteWorkspace(ws.id)}
                                                        className="p-2 rounded-lg transition-all"
                                                        style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                                                        title="Delete workspace"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {/* Metadata */}
                                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    Saved {new Date(ws.createdAt).toLocaleDateString()} {new Date(ws.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── RULES TAB ── */}
                {activeTab === 'rules' && (
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
