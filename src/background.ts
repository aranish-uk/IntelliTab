import { classifyTabs, processFeedback, processCorrections } from './lib/aiClient';
import { getRules } from './lib/rulesEngine';
import { getLearnedPatterns, getSoulText, logManualGrouping, saveLearnedPatterns, saveSoulText, learnPassivelyFromCurrentGroups, logCorrectionLearning, appendSoulCorrectionBlock } from './lib/learningEngine';
import {
    autoSnapshotCurrentGroups,
    createWorkspaceFromCurrent,
    deleteWorkspace,
    getWorkspaces,
    saveWorkspaces,
    restoreWorkspace,
    restoreSingleGroup,
    closeWorkspaceTabs,
    restoreFromAutoSnapshot,
    getAutoSnapshot,
    pickColor,
    normalizeUrl,
} from './lib/workspaceEngine';
import { TabInfo, LastAction, AIConfig, GroupConfig, TabGroupColor, TAB_GROUP_COLORS, CorrectionDiff, TabCorrection, GroupRename, TabStats, DuplicateGroup, ColorMap, AutoOrganizeConfig, DEFAULT_AUTO_ORGANIZE } from './types';
import { trackTabActivation, removeTabActivity, getStaleTabs, getStaleConfig, saveStaleConfig, getStaleTabCount } from './lib/activityTracker';
import { detectWorkspaceMatch } from './lib/workspaceMatcher';
import { getSyncConfig, saveSyncConfig, pushToSync, pullFromSync, debouncedPush } from './lib/syncEngine';
import {
    handleTabCreatedForInheritance,
    handleTabActivatedForFocus,
    groupHighlightedTabs,
    getContextGroupConfig,
    saveContextGroupConfig,
    wasInherited,
} from './lib/contextGrouper';

// ─── Debug logging ──────────────────────────────────────────────────

const DEBUG = true;

function log(tag: string, ...args: any[]) {
    if (DEBUG) console.log(`[IntelliTab:${tag}]`, ...args);
}

function logError(tag: string, ...args: any[]) {
    console.error(`[IntelliTab:${tag}]`, ...args);
}

// ─── Utility ────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Installation ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
    log('install', 'Extension installed/updated');
    chrome.runtime.openOptionsPage();
    chrome.storage.local.get(['aiConfig', 'groqApiKey'], (result) => {
        if (!result.aiConfig) {
            const defaultConfig: AIConfig = {
                provider: 'groq',
                apiKey: result.groqApiKey || '',
                model: 'llama-3.3-70b-versatile'
            };
            chrome.storage.local.set({ aiConfig: defaultConfig });
            log('install', 'Default AI config created');
        }
    });

    // Set up periodic passive learning alarm (every 3 hours)
    chrome.alarms.create('intellitab_passive_learn', {
        delayInMinutes: 60,     // first run after 1 hour
        periodInMinutes: 180,   // then every 3 hours
    });
    log('install', 'Passive learning alarm scheduled (every 3 hours)');
});

// ─── Periodic passive learning via alarm ─────────────────────────────
//
// Every few hours, we quietly snapshot how the user has their tabs grouped
// and learn from it with LOW confidence (weight 0.3). This picks up the
// user's organic organization habits without requiring any action from them.

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'intellitab_passive_learn') {
        log('passive-learn', 'Alarm fired, learning from current groups');
        try {
            const learned = await learnPassivelyFromCurrentGroups();
            log('passive-learn', `Passively learned ${learned} domain→group associations`);
            // Also refresh the auto-snapshot while we're at it
            await autoSnapshotCurrentGroups();
        } catch (err) {
            logError('passive-learn', 'Failed:', err);
        }
    }
});

// ─── Badge: show ungrouped tab count ────────────────────────────────

async function updateBadge() {
    try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const ungrouped = tabs.filter(t =>
            !t.pinned &&
            (t.groupId === undefined || t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || t.groupId === -1) &&
            t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('brave://')
        );
        const count = ungrouped.length;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
        chrome.action.setBadgeBackgroundColor({ color: count > 10 ? '#dc2626' : '#666666' });
    } catch {
        // Window may not exist yet
    }
}

// Update badge on tab/group changes
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.groupId !== undefined) updateBadge();
});
chrome.tabGroups.onCreated.addListener(updateBadge);
chrome.tabGroups.onRemoved.addListener(updateBadge);
chrome.tabGroups.onUpdated.addListener(updateBadge);
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) updateBadge();
});

// ─── Auto-organize engine ───────────────────────────────────────────

// Track recent tab creation timestamps for burst detection (in-memory only)
const recentTabCreations: number[] = [];
let autoOrganizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function getAutoOrganizeConfig(): Promise<AutoOrganizeConfig> {
    const result = await chrome.storage.local.get(['autoOrganizeConfig']);
    return result.autoOrganizeConfig || DEFAULT_AUTO_ORGANIZE;
}

async function shouldAutoOrganize(): Promise<'threshold' | 'burst' | false> {
    const config = await getAutoOrganizeConfig();
    if (!config.enabled) return false;

    // Check cooldown
    const result = await chrome.storage.local.get(['lastAutoOrganize']);
    const lastRun = result.lastAutoOrganize || 0;
    if (Date.now() - lastRun < config.cooldownMinutes * 60 * 1000) return false;

    // Check API key
    const aiConfig = await getAIConfig();
    if (!aiConfig.apiKey) return false;

    // Check threshold
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const ungrouped = tabs.filter(t =>
        !t.pinned &&
        (t.groupId === undefined || t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || t.groupId === -1) &&
        t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('brave://')
    );

    if (ungrouped.length >= config.ungroupedThreshold) return 'threshold';

    // Check burst
    if (config.burstDetection) {
        const now = Date.now();
        const recentInWindow = recentTabCreations.filter(ts => now - ts < config.burstWindow);
        if (recentInWindow.length >= config.burstCount) return 'burst';
    }

    return false;
}

async function triggerAutoOrganize(reason: 'threshold' | 'burst') {
    log('auto-organize', `Triggered by ${reason}`);

    // Flash badge to indicate auto-organize is running
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });

    try {
        const analysisResult = await handleAnalyzeTabs(true); // ungrouped only
        if (analysisResult.groups.length > 0) {
            await handleGroupTabs(analysisResult.groups);
            log('auto-organize', `Auto-organized ${analysisResult.groups.length} groups`);
        }
        await chrome.storage.local.set({ lastAutoOrganize: Date.now() });
    } catch (err) {
        logError('auto-organize', 'Failed:', err);
    }

    // Restore normal badge
    updateBadge();
}

// ─── Context-aware grouping fast path (runs before AI pipeline) ─────

chrome.tabs.onCreated.addListener(async (tab) => {
    // Try to inherit the opener's group synchronously-ish. Errors are swallowed
    // so we never break the rest of the pipeline.
    try {
        await handleTabCreatedForInheritance(tab);
    } catch (err) {
        logError('context', 'Inheritance handler failed:', err);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        await handleTabActivatedForFocus(activeInfo);
    } catch (err) {
        logError('context', 'Focus handler failed:', err);
    }
});

// ─── Manual grouping shortcut (ALT+G) ───────────────────────────────

if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener(async (command) => {
        if (command !== 'group-selected') return;
        const config = await getContextGroupConfig();
        if (!config.manualShortcut) return;
        try {
            const result = await groupHighlightedTabs();
            log('context', `Manual group: ${result.grouped} tabs → group ${result.groupId}`);
        } catch (err) {
            logError('context', 'Manual group failed:', err);
        }
    });
}

// Hook into tab creation for auto-organize
chrome.tabs.onCreated.addListener(async (tab) => {
    // Tabs we just inherited shouldn't count toward the burst threshold —
    // they were never "ungrouped chaos" the user needs help with.
    // Wait a tick so the inheritance handler above has a chance to run.
    await new Promise(r => setTimeout(r, 50));
    if (tab.id !== undefined && wasInherited(tab.id)) return;

    recentTabCreations.push(Date.now());
    // Keep only last 20 entries
    while (recentTabCreations.length > 20) recentTabCreations.shift();

    // Debounce: wait 3s after last tab creation before checking
    if (autoOrganizeDebounceTimer) clearTimeout(autoOrganizeDebounceTimer);
    autoOrganizeDebounceTimer = setTimeout(async () => {
        const reason = await shouldAutoOrganize();
        if (reason) await triggerAutoOrganize(reason);
    }, 3000);
});

// ─── Tab activity tracking (Feature 2) ──────────────────────────────

chrome.tabs.onActivated.addListener((activeInfo) => {
    trackTabActivation(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    removeTabActivity(tabId);
});

// ─── Stale tab alarm ────────────────────────────────────────────────

async function setupStaleAlarm() {
    const config = await getStaleConfig();
    if (config.enabled) {
        chrome.alarms.create('intellitab_stale_check', {
            delayInMinutes: config.checkIntervalMinutes,
            periodInMinutes: config.checkIntervalMinutes,
        });
        log('stale', `Stale check alarm set (every ${config.checkIntervalMinutes} min)`);
    } else {
        chrome.alarms.clear('intellitab_stale_check');
    }
}

// Set up stale alarm on install
chrome.runtime.onInstalled.addListener(() => {
    setupStaleAlarm();
});

// Handle stale check alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'intellitab_stale_check') {
        log('stale', 'Stale check alarm fired');
        const count = await getStaleTabCount();
        if (count > 0) {
            await chrome.storage.local.set({ intellitab_stale_count: count });
            log('stale', `Found ${count} stale tabs`);
        } else {
            await chrome.storage.local.set({ intellitab_stale_count: 0 });
        }
    }
});

// ─── Sync: pull on startup, push on local changes ──────────────────

chrome.runtime.onStartup.addListener(async () => {
    const config = await getSyncConfig();
    if (config.enabled) {
        log('sync', 'Pulling from sync on startup');
        await pullFromSync();
    }
});

// Listen for changes to sync storage from other devices
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
        log('sync', 'Remote sync change detected');
        pullFromSync().catch(err => logError('sync', 'Pull failed:', err));
    }
    // When local data changes that should sync, trigger debounced push
    if (areaName === 'local') {
        const syncableKeys = ['soulText', 'rules', 'groupConfigs'];
        const changedKeys = Object.keys(changes);
        if (changedKeys.some(k => syncableKeys.includes(k))) {
            getSyncConfig().then(config => {
                if (config.enabled) debouncedPush();
            });
        }
    }
});

// ─── Startup: check if auto-snapshot recovery is needed ─────────────
//
// Chromium/Brave does NOT reliably persist extension-created tab groups
// across browser restarts. This is a known limitation of the tabGroups API:
// the session manager may not capture groups created programmatically the
// same way it captures user-created groups.
//
// To work around this, IntelliTab saves a "shadow snapshot" of all groups
// after every grouping operation. On browser startup, if no groups exist
// but a snapshot is available, we can offer restoration.

chrome.runtime.onStartup.addListener(async () => {
    log('startup', 'Browser started, checking for group recovery');
    updateBadge();
    try {
        const groups = await chrome.tabGroups.query({});
        const snapshot = await getAutoSnapshot();

        if (groups.length === 0 && snapshot && snapshot.groups.length > 0) {
            log('startup', `No groups found but snapshot has ${snapshot.groups.length} groups from ${new Date(snapshot.savedAt).toISOString()}`);
            // Store a flag so the popup can offer restoration
            await chrome.storage.local.set({ intellitab_recovery_available: true });
        } else {
            await chrome.storage.local.set({ intellitab_recovery_available: false });
        }
    } catch (err) {
        logError('startup', 'Recovery check failed:', err);
    }
});

// ─── Config helpers ─────────────────────────────────────────────────

async function getAIConfig(): Promise<AIConfig> {
    const result = await chrome.storage.local.get(['aiConfig', 'groqApiKey']);
    if (result.aiConfig) return result.aiConfig;

    const config: AIConfig = {
        provider: 'groq',
        apiKey: result.groqApiKey || '',
        model: 'llama-3.3-70b-versatile'
    };
    await chrome.storage.local.set({ aiConfig: config });
    return config;
}

// ─── Message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    const action = request.action;
    log('message', `Received action: ${action}`);

    // ── Tab organization actions ──

    if (action === 'analyzeTabs') {
        handleAnalyzeTabs(request.ungroupedOnly).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'groupTabs') {
        const fullTabsData = request.groups.map(async (g: any) => {
            const tabsData = await Promise.all(
                g.tabIds.map(async (id: number) => {
                    try {
                        const tab = await chrome.tabs.get(id);
                        return {
                            title: tab.title || '',
                            domain: tab.url ? new URL(tab.url).hostname : '',
                            url: tab.url || ''
                        };
                    } catch {
                        return { title: 'Unknown', domain: 'unknown', url: '' };
                    }
                })
            );
            return {
                groupName: g.groupName,
                tabCount: g.tabIds.length,
                tabs: tabsData
            };
        });

        Promise.all(fullTabsData).then((groupsCreated) => {
            handleGroupTabs(request.groups).then((res) => {
                const totalTabs = groupsCreated.reduce((acc, g) => acc + g.tabCount, 0);

                // Build URL→group mapping for correction detection later
                const urlToGroup: Record<string, string> = {};
                for (const g of groupsCreated) {
                    for (const t of g.tabs) {
                        if (t.url) {
                            urlToGroup[normalizeUrl(t.url)] = g.groupName;
                        }
                    }
                }

                const lastAction: LastAction = {
                    timestamp: Date.now(),
                    tabsOrganized: totalTabs,
                    groupsCreated,
                    closeRecommendations: 0,
                    urlToGroup,
                };
                chrome.storage.local.set({ lastAction });
                sendResponse(res);
            }).catch(err => sendResponse({ error: err.message }));
        });
        return true;
    }

    if (action === 'processFeedback') {
        handleProcessFeedback(request.chatLog).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'ungroupAll') {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
            if (tabIds.length > 0) {
                chrome.tabs.ungroup(tabIds, () => sendResponse({ success: true }));
            } else {
                sendResponse({ success: true });
            }
        });
        return true;
    }

    // ── Workspace actions ──

    if (action === 'getWorkspaces') {
        getWorkspaces().then(ws => sendResponse({ workspaces: ws })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'saveWorkspace') {
        createWorkspaceFromCurrent(request.name)
            .then(ws => sendResponse({ success: true, workspace: ws }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'deleteWorkspace') {
        deleteWorkspace(request.workspaceId)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'restoreWorkspace') {
        restoreWorkspace(request.workspaceId, { mergeExisting: request.mergeExisting ?? true })
            .then(result => sendResponse({ success: true, ...result }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'restoreGroup') {
        restoreSingleGroup(request.workspaceId, request.groupId, { mergeExisting: request.mergeExisting ?? true })
            .then(result => sendResponse({ success: true, ...result }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'closeWorkspace') {
        closeWorkspaceTabs(request.workspaceId)
            .then(count => sendResponse({ success: true, tabsClosed: count }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'saveAndCloseWorkspace') {
        createWorkspaceFromCurrent(request.name)
            .then(async (ws) => {
                const count = await closeWorkspaceTabs(ws.id);
                sendResponse({ success: true, workspace: ws, tabsClosed: count });
            })
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'restoreAutoSnapshot') {
        restoreFromAutoSnapshot({ mergeExisting: request.mergeExisting ?? true })
            .then(result => {
                chrome.storage.local.set({ intellitab_recovery_available: false });
                sendResponse({ success: true, ...(result || { tabsRestored: 0, groupsRestored: 0 }) });
            })
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'checkRecovery') {
        chrome.storage.local.get(['intellitab_recovery_available'], (result) => {
            sendResponse({ recoveryAvailable: !!result.intellitab_recovery_available });
        });
        return true;
    }

    if (action === 'dismissRecovery') {
        chrome.storage.local.set({ intellitab_recovery_available: false });
        sendResponse({ success: true });
        return true;
    }

    // ── Learning / correction actions ──

    if (action === 'learnFromCurrentState') {
        handleLearnFromCurrentState()
            .then(result => sendResponse({ success: true, ...result }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'detectCorrections') {
        handleDetectCorrections()
            .then(diff => sendResponse({ success: true, diff }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'learnFromCorrections') {
        handleLearnFromCorrections()
            .then(result => sendResponse({ success: true, ...result }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Tab stats ──

    if (action === 'getTabStats') {
        handleGetTabStats().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Undo last grouping ──

    if (action === 'undoLastGrouping') {
        handleUndoLastGrouping().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Duplicate detection ──

    if (action === 'detectDuplicates') {
        handleDetectDuplicates().then(dupes => sendResponse({ success: true, duplicates: dupes })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'closeDuplicates') {
        handleCloseDuplicates(request.tabIds).then(count => sendResponse({ success: true, closed: count })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Collapse / Expand all groups ──

    if (action === 'collapseAllGroups') {
        handleToggleAllGroups(true).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'expandAllGroups') {
        handleToggleAllGroups(false).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Check if API key is configured ──

    // ── Remove a browser tab group by name ──

    if (action === 'removeBrowserGroup') {
        handleRemoveBrowserGroup(request.groupName).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'checkApiKey') {
        getAIConfig().then(config => sendResponse({ hasApiKey: !!config.apiKey })).catch(() => sendResponse({ hasApiKey: false }));
        return true;
    }

    // ── Popup settings ──

    if (action === 'getPopupSettings') {
        chrome.storage.local.get(['popupSettings'], (result) => {
            sendResponse(result.popupSettings || { showOrganize: true, showLearn: true, showWorkspaces: true, showRules: true });
        });
        return true;
    }

    if (action === 'savePopupSettings') {
        chrome.storage.local.set({ popupSettings: request.settings });
        sendResponse({ success: true });
        return true;
    }

    // ── Auto-organize config ──

    if (action === 'getAutoOrganizeConfig') {
        getAutoOrganizeConfig().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'saveAutoOrganizeConfig') {
        chrome.storage.local.set({ autoOrganizeConfig: request.config });
        sendResponse({ success: true });
        return true;
    }

    // ── Stale tab detection ──

    if (action === 'getStaleConfig') {
        getStaleConfig().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'saveStaleConfig') {
        saveStaleConfig(request.config).then(() => {
            setupStaleAlarm();
            sendResponse({ success: true });
        }).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'getStaleTabs') {
        getStaleTabs().then(tabs => sendResponse({ success: true, staleTabs: tabs })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'archiveStaleTabs') {
        handleArchiveStaleTabs().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'closeStaleTabs') {
        handleCloseStaleTabs(request.tabIds).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Workspace suggestions ──

    if (action === 'getWorkspaceSuggestions') {
        detectWorkspaceMatch(0.3).then(suggestions => sendResponse({ success: true, suggestions })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'restoreMissingTabs') {
        handleRestoreMissingTabs(request.urls).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Sync ──

    if (action === 'getSyncConfig') {
        getSyncConfig().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'saveSyncConfig') {
        saveSyncConfig(request.config).then(() => sendResponse({ success: true })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'syncNow') {
        pushToSync()
            .then(() => pullFromSync())
            .then(result => sendResponse({ success: true, ...result }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'getAutoOrganizeStatus') {
        chrome.storage.local.get(['lastAutoOrganize', 'autoOrganizeConfig'], (result) => {
            const config = result.autoOrganizeConfig || DEFAULT_AUTO_ORGANIZE;
            sendResponse({
                enabled: config.enabled,
                lastRun: result.lastAutoOrganize || null,
            });
        });
        return true;
    }

    // ── Classification telemetry (last 50 events) ──

    if (action === 'getClassifyTelemetry') {
        chrome.storage.local.get(['intellitab_classify_telemetry'], (result) => {
            sendResponse({ events: result.intellitab_classify_telemetry || [] });
        });
        return true;
    }

    if (action === 'clearClassifyTelemetry') {
        chrome.storage.local.set({ intellitab_classify_telemetry: [] }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    // ── Context-aware grouping (non-LLM fast path) ──

    if (action === 'getContextGroupConfig') {
        getContextGroupConfig().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'saveContextGroupConfig') {
        saveContextGroupConfig(request.config)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (action === 'groupHighlighted') {
        groupHighlightedTabs(request.name)
            .then(result => sendResponse({ success: true, ...result }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Catch-all: unknown action ──
    // If no handler matched, respond immediately so the message port doesn't hang.
    // This prevents "message port closed" errors when the service worker has stale code.
    log('message', `Unknown action: ${action}`);
    sendResponse({ error: `Unknown action: ${action}` });
    return false;
});

// ─── Automatic learning listener ────────────────────────────────────

chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (group.title) {
        const tabs = await chrome.tabs.query({ groupId: group.id });
        for (const tab of tabs) {
            if (tab.url) {
                const domain = new URL(tab.url).hostname;
                await logManualGrouping(domain, group.title);
            }
        }
    }
});

// ─── Core handlers ──────────────────────────────────────────────────

async function handleAnalyzeTabs(ungroupedOnly?: boolean) {
    log('analyze', 'Starting tab analysis', { ungroupedOnly });
    const tabs = await chrome.tabs.query({ currentWindow: true });
    log('analyze', `Found ${tabs.length} tabs in current window`);

    // Filter out pinned tabs — they are intentional anchors
    const unpinnedTabs = tabs.filter(t => !t.pinned);
    log('analyze', `Filtered out ${tabs.length - unpinnedTabs.length} pinned tabs`);

    let tabInfos: TabInfo[] = unpinnedTabs.map(t => ({
        id: t.id!,
        url: t.url || '',
        title: t.title || '',
        domain: t.url ? new URL(t.url).hostname : '',
        groupId: t.groupId,
        lastAccessed: (t as any).lastAccessed || Date.now()
    }));

    if (ungroupedOnly && chrome.tabGroups) {
        tabInfos = tabInfos.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || t.groupId === undefined || t.groupId === -1);
        log('analyze', `Filtered to ${tabInfos.length} ungrouped tabs`);
    }

    const groupConfigsResult = await chrome.storage.local.get(['groupConfigs']);
    const groupConfigs: GroupConfig[] = groupConfigsResult.groupConfigs || [
        { name: 'Dev', permission: 'editable' },
        { name: 'Study', permission: 'editable' },
        { name: 'Entertainment', permission: 'editable' },
        { name: 'Communication', permission: 'editable' }
    ];

    let existingGroupsMap: Record<number, string> = {};
    if (chrome.tabGroups) {
        const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        existingGroupsMap = existingGroups.reduce((acc, g) => {
            acc[g.id] = g.title || '';
            return acc;
        }, {} as Record<number, string>);
        log('analyze', `Existing groups:`, existingGroupsMap);
    }

    tabInfos = tabInfos.filter(t => {
        if (t.groupId !== undefined && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && t.groupId !== -1) {
            const groupName = existingGroupsMap[t.groupId];
            const config = groupConfigs.find(c => c.name === groupName);
            if (config && (config.permission === 'locked' || config.permission === 'append_only')) {
                return false;
            }
        }
        return true;
    });

    log('analyze', `${tabInfos.length} tabs eligible for classification`);

    const rules = await getRules();
    const learnedPatterns = await getLearnedPatterns();
    const soulText = await getSoulText();
    const aiConfig = await getAIConfig();

    if (!aiConfig.apiKey) {
        throw new Error(`${aiConfig.provider.toUpperCase()} API Key is not set.`);
    }

    const result = await classifyTabs(tabInfos, rules, aiConfig, soulText, learnedPatterns, groupConfigs);
    log('analyze', `Classification complete: ${result.groups.length} groups suggested`);
    return result;
}

/**
 * Improved tab grouping with stabilization delays and explicit color assignment.
 *
 * Why delays matter:
 * - Brave/Chromium session manager snapshots tab state periodically
 * - Groups created and updated in rapid succession may not be captured
 * - Adding small delays between operations gives the session manager time
 *   to register each group fully before the next one is created
 * - Explicit color assignment ensures the group has complete metadata,
 *   which may improve session persistence
 */
async function handleGroupTabs(groups: { groupName: string, tabIds: number[] }[]) {
    log('group', `Creating ${groups.length} groups`);

    // Load persisted color map so group names keep their colors across sessions
    const colorMapResult = await chrome.storage.local.get(['colorMap']);
    const colorMap: ColorMap = colorMapResult.colorMap || {};

    // Track which color index we've used so groups get distinct colors
    let colorIndex = 0;

    // Check what existing groups are already in the window — reuse them instead of creating duplicates
    const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    const usedColors = new Set(existingGroups.map(g => g.color));

    // Build a map of existing group names → their browser group IDs
    const existingGroupByName: Record<string, number> = {};
    for (const eg of existingGroups) {
        if (eg.title) {
            existingGroupByName[eg.title] = eg.id;
        }
    }

    for (const group of groups) {
        if (group.tabIds.length === 0) continue;

        // Validate tab IDs are still valid before grouping
        const validTabIds: number[] = [];
        for (const tabId of group.tabIds) {
            try {
                await chrome.tabs.get(tabId);
                validTabIds.push(tabId);
            } catch {
                log('group', `Tab ${tabId} no longer exists, skipping`);
            }
        }

        if (validTabIds.length === 0) {
            log('group', `No valid tabs for group "${group.groupName}", skipping`);
            continue;
        }

        try {
            let groupId: number;

            // Step 1: Reuse existing group if one with the same name exists, otherwise create new
            if (existingGroupByName[group.groupName]) {
                // Add tabs to the existing group
                groupId = existingGroupByName[group.groupName];
                await chrome.tabs.group({ tabIds: validTabIds, groupId });
                log('group', `Added ${validTabIds.length} tabs to existing group "${group.groupName}" (id=${groupId})`);
            } else {
                // Create a new group
                log('group', `Creating new group for "${group.groupName}" with ${validTabIds.length} tabs`);
                groupId = await chrome.tabs.group({ tabIds: validTabIds });
                existingGroupByName[group.groupName] = groupId;
                log('group', `Group created with browser ID ${groupId}`);
            }

            // Step 2: Stabilization delay before updating metadata
            await delay(150);

            // Step 3: Pick a color — use persisted color if available, otherwise pick new one
            let color: TabGroupColor;
            if (colorMap[group.groupName]) {
                color = colorMap[group.groupName];
            } else {
                color = pickColor(colorIndex);
                while (usedColors.has(color) && colorIndex < TAB_GROUP_COLORS.length) {
                    colorIndex++;
                    color = pickColor(colorIndex);
                }
                colorIndex++;
            }
            usedColors.add(color);
            colorMap[group.groupName] = color;

            // Step 4: Update with full metadata (title + color + collapsed state)
            await chrome.tabGroups.update(groupId, {
                title: group.groupName,
                color: color,
                collapsed: false,
            });
            log('group', `Group "${group.groupName}" updated: color=${color}, id=${groupId}`);

            // Step 5: Verify the group was created correctly
            try {
                const verified = await chrome.tabGroups.get(groupId);
                log('group', `Verified group "${verified.title}": color=${verified.color}, id=${verified.id}`);
            } catch (err) {
                logError('group', `Verification failed for group ${groupId}:`, err);
            }

            // Step 6: Inter-group stabilization delay
            await delay(100);
        } catch (err) {
            logError('group', `Failed to create group "${group.groupName}":`, err);
        }
    }

    // Persist the color map so group names keep their colors
    await chrome.storage.local.set({ colorMap });

    // After all groups are created, take an auto-snapshot for recovery
    log('group', 'All groups created, taking auto-snapshot');
    await delay(200); // Final stabilization before snapshot
    try {
        await autoSnapshotCurrentGroups();
        log('group', 'Auto-snapshot saved');
    } catch (err) {
        logError('group', 'Auto-snapshot failed:', err);
    }

    return { success: true };
}

async function handleProcessFeedback(chatLog: { sender: 'user' | 'ai', message: string }[]) {
    const storage = await chrome.storage.local.get(['lastAction']);
    const aiConfig = await getAIConfig();

    if (!aiConfig.apiKey) throw new Error(`${aiConfig.provider.toUpperCase()} API Key is not set.`);

    const soulText = await getSoulText();
    const learnedPatterns = await getLearnedPatterns();

    const lastAction = storage.lastAction || {
        timestamp: Date.now(),
        tabsOrganized: 0,
        groupsCreated: [],
        closeRecommendations: 0
    };

    const response = await processFeedback(chatLog, lastAction, soulText, learnedPatterns, aiConfig);

    if (response.updatedSoul) await saveSoulText(response.updatedSoul);

    if (response.updatedPatterns && typeof response.updatedPatterns === 'object') {
        const mergedPatterns = { ...learnedPatterns };
        for (const [domain, groups] of Object.entries(response.updatedPatterns)) {
            if (!mergedPatterns[domain]) mergedPatterns[domain] = {};
            for (const [groupName, weight] of Object.entries(groups)) {
                mergedPatterns[domain][groupName] = (mergedPatterns[domain][groupName] || 0) + (weight as number);
            }
        }
        await saveLearnedPatterns(mergedPatterns);
    }

    return response;
}

// ─── Correction detection ───────────────────────────────────────────
//
// After the AI groups tabs and the user manually adjusts them, we can
// detect what changed by comparing the current browser state to the
// lastAction's urlToGroup mapping. This tells us:
//   - Which tabs were moved to different groups (bad grouping)
//   - Which groups were renamed (bad naming)
//   - Which tabs were newly grouped or ungrouped

async function handleDetectCorrections(): Promise<CorrectionDiff> {
    const storage = await chrome.storage.local.get(['lastAction']);
    const lastAction: LastAction | undefined = storage.lastAction;

    if (!lastAction || !lastAction.urlToGroup) {
        throw new Error('No previous AI grouping to compare against. Run "Analyze + Apply" first.');
    }

    const aiUrlToGroup = lastAction.urlToGroup;
    const aiGroupNames = new Set(Object.values(aiUrlToGroup));

    // Build current state: URL → current group name
    // Use getLastFocused for reliability from service worker context
    const focusedWindow = await chrome.windows.getLastFocused({ populate: false });
    const windowId = focusedWindow.id!;

    const currentGroups = await chrome.tabGroups.query({ windowId });
    const groupIdToName: Record<number, string> = {};
    for (const g of currentGroups) {
        if (g.title) groupIdToName[g.id] = g.title;
    }

    const currentTabs = await chrome.tabs.query({ windowId });
    const currentUrlToGroup: Record<string, { group: string; title: string; domain: string }> = {};
    for (const tab of currentTabs) {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('brave://')) continue;
        const normalized = normalizeUrl(tab.url);
        const groupName = (tab.groupId && tab.groupId !== -1 && groupIdToName[tab.groupId])
            ? groupIdToName[tab.groupId]
            : 'ungrouped';
        currentUrlToGroup[normalized] = {
            group: groupName,
            title: tab.title || '',
            domain: new URL(tab.url).hostname,
        };
    }

    const tabCorrections: TabCorrection[] = [];

    // Check each URL that was in the AI's grouping
    for (const [url, aiGroup] of Object.entries(aiUrlToGroup)) {
        const current = currentUrlToGroup[url];
        if (!current) continue; // tab was closed — not a correction

        if (current.group !== aiGroup) {
            let correctionType: TabCorrection['correctionType'] = 'moved';
            if (current.group === 'ungrouped') correctionType = 'ungrouped';
            if (aiGroup === 'ungrouped') correctionType = 'newly_grouped';

            tabCorrections.push({
                url,
                title: current.title,
                domain: current.domain,
                fromGroup: aiGroup,
                toGroup: current.group,
                correctionType,
            });
        }
    }

    // Check for tabs that weren't in AI's grouping but are now grouped (user added)
    for (const [url, current] of Object.entries(currentUrlToGroup)) {
        if (current.group !== 'ungrouped' && !aiUrlToGroup[url]) {
            tabCorrections.push({
                url,
                title: current.title,
                domain: current.domain,
                fromGroup: 'ungrouped',
                toGroup: current.group,
                correctionType: 'newly_grouped',
            });
        }
    }

    // Detect group renames: if a group name exists in current state that wasn't in AI state,
    // and an AI group name is missing, it's likely a rename
    const currentGroupNames = new Set(Object.values(groupIdToName));
    const groupRenames: GroupRename[] = [];
    const newGroupsCreated: string[] = [];

    for (const currentName of currentGroupNames) {
        if (!aiGroupNames.has(currentName)) {
            // Is this a rename of an AI group? Check if tabs from one AI group are now in this group
            const tabsInThisGroup = Object.entries(currentUrlToGroup)
                .filter(([_, v]) => v.group === currentName);

            // Find which AI group these tabs mostly came from
            const sourceGroups: Record<string, number> = {};
            for (const [url] of tabsInThisGroup) {
                const aiGroup = aiUrlToGroup[url];
                if (aiGroup && !currentGroupNames.has(aiGroup)) {
                    sourceGroups[aiGroup] = (sourceGroups[aiGroup] || 0) + 1;
                }
            }

            const topSource = Object.entries(sourceGroups).sort((a, b) => b[1] - a[1])[0];
            if (topSource && topSource[1] >= 2) {
                groupRenames.push({
                    oldName: topSource[0],
                    newName: currentName,
                    tabCount: tabsInThisGroup.length,
                });
            } else {
                newGroupsCreated.push(currentName);
            }
        }
    }

    const diff: CorrectionDiff = {
        tabCorrections,
        groupRenames,
        newGroupsCreated,
        timestamp: Date.now(),
    };

    log('corrections', `Detected: ${tabCorrections.length} tab moves, ${groupRenames.length} renames, ${newGroupsCreated.length} new groups`);
    return diff;
}

/**
 * Detect corrections, learn from them, and optionally ask AI for SOUL suggestions.
 * This is the full "This is how I like my tabs" flow.
 */
async function handleLearnFromCorrections(): Promise<{
    diff: CorrectionDiff;
    analysis: { summary: string; soulSuggestions?: string } | null;
    patternsUpdated: number;
}> {
    const diff = await handleDetectCorrections();

    if (diff.tabCorrections.length === 0 && diff.groupRenames.length === 0) {
        return {
            diff,
            analysis: { summary: 'No corrections detected. Your tabs look the same as when AI grouped them.' },
            patternsUpdated: 0,
        };
    }

    // Step 1: Direct pattern learning from corrections (no AI needed)
    let patternsUpdated = 0;
    for (const correction of diff.tabCorrections) {
        if (correction.correctionType === 'moved' || correction.correctionType === 'newly_grouped') {
            await logCorrectionLearning(correction.domain, correction.toGroup, correction.fromGroup);
            patternsUpdated++;
        }
    }

    // Step 2: Try AI analysis for SOUL suggestions (if API key is set)
    let analysis: { summary: string; soulSuggestions?: string } | null = null;
    try {
        const aiConfig = await getAIConfig();
        if (aiConfig.apiKey) {
            const soulText = await getSoulText();
            const patterns = await getLearnedPatterns();
            const aiResult = await processCorrections(diff, soulText, patterns, aiConfig);
            analysis = {
                summary: aiResult.summary,
                soulSuggestions: aiResult.soulSuggestions || undefined,
            };

            // Merge AI-suggested patterns with moderate confidence
            if (aiResult.updatedPatterns && typeof aiResult.updatedPatterns === 'object') {
                const existingPatterns = await getLearnedPatterns();
                for (const [domain, groups] of Object.entries(aiResult.updatedPatterns)) {
                    if (!existingPatterns[domain]) existingPatterns[domain] = {};
                    for (const [groupName, weight] of Object.entries(groups)) {
                        existingPatterns[domain][groupName] = (existingPatterns[domain][groupName] || 0) + (weight as number);
                    }
                }
                await saveLearnedPatterns(existingPatterns);
            }

            // If AI suggests SOUL amendments, append via the bounded compactor
            // so SOUL doesn't grow forever and poison future classify prompts.
            if (aiResult.soulSuggestions) {
                await appendSoulCorrectionBlock(aiResult.soulSuggestions);
                log('corrections', 'SOUL amended with correction insights (bounded)');
            }

            log('corrections', `AI analysis: ${aiResult.summary}`);
        }
    } catch (err) {
        logError('corrections', 'AI analysis failed (continuing with pattern-only learning):', err);
        analysis = {
            summary: `Learned ${patternsUpdated} corrections directly. AI analysis unavailable.`,
        };
    }

    if (!analysis) {
        analysis = {
            summary: `Learned ${patternsUpdated} tab corrections into patterns.`,
        };
    }

    return { diff, analysis, patternsUpdated };
}

/**
 * "This is how I like it" — learn from whatever groups are currently open.
 * No prior AI action needed. Treats the current state as the user's preferred
 * organization with HIGH confidence (weight 2.0).
 */
async function handleLearnFromCurrentState(): Promise<{
    groupsLearned: number;
    patternsLearned: number;
    groupNames: string[];
}> {
    const PREFERRED_WEIGHT = 2.0;

    // Use getLastFocused instead of WINDOW_ID_CURRENT for reliability from service worker
    const focusedWindow = await chrome.windows.getLastFocused({ populate: false });
    if (!focusedWindow.id) {
        throw new Error('Could not determine the active window.');
    }

    log('learn-state', `Querying groups in window ${focusedWindow.id}`);
    const groups = await chrome.tabGroups.query({ windowId: focusedWindow.id });
    log('learn-state', `Found ${groups.length} groups`);

    if (groups.length === 0) {
        throw new Error('No tab groups found. Group some tabs first, then tell IntelliTab this is how you like it.');
    }

    let patternsLearned = 0;
    const groupNames: string[] = [];

    for (const group of groups) {
        if (!group.title) continue;
        groupNames.push(group.title);

        const tabs = await chrome.tabs.query({ groupId: group.id });
        log('learn-state', `Group "${group.title}": ${tabs.length} tabs`);
        for (const tab of tabs) {
            if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('brave://')) {
                try {
                    const domain = new URL(tab.url).hostname;
                    await logManualGrouping(domain, group.title, PREFERRED_WEIGHT);
                    patternsLearned++;
                } catch (err) {
                    logError('learn-state', `Failed to parse URL: ${tab.url}`, err);
                }
            }
        }
    }

    log('learn-state', `Learned ${patternsLearned} patterns from ${groupNames.length} groups: ${groupNames.join(', ')}`);

    return {
        groupsLearned: groupNames.length,
        patternsLearned,
        groupNames,
    };
}

// ─── Sprint 1: New handlers ────────────────────────────────────────

/** Get live tab statistics for the popup header */
async function handleGetTabStats(): Promise<TabStats> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    const pinned = tabs.filter(t => t.pinned).length;
    const grouped = tabs.filter(t =>
        t.groupId !== undefined && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && t.groupId !== -1
    ).length;
    const ungrouped = tabs.length - grouped - pinned;

    return { total: tabs.length, grouped, ungrouped, groups: groups.length, pinned };
}

/** Undo the last AI grouping by ungrouping all tabs that were grouped */
async function handleUndoLastGrouping() {
    const storage = await chrome.storage.local.get(['lastAction']);
    const lastAction: LastAction | undefined = storage.lastAction;

    if (!lastAction || !lastAction.urlToGroup) {
        throw new Error('No previous AI grouping to undo.');
    }

    // Find tabs whose URLs match the last action's grouped URLs
    const focusedWindow = await chrome.windows.getLastFocused({ populate: false });
    const currentTabs = await chrome.tabs.query({ windowId: focusedWindow.id });
    const tabIdsToUngroup: number[] = [];

    for (const tab of currentTabs) {
        if (!tab.url || !tab.id) continue;
        const normalized = normalizeUrl(tab.url);
        if (lastAction.urlToGroup[normalized]) {
            tabIdsToUngroup.push(tab.id);
        }
    }

    if (tabIdsToUngroup.length > 0) {
        await chrome.tabs.ungroup(tabIdsToUngroup);
    }

    // Clear the last action so undo can't be triggered again
    await chrome.storage.local.remove(['lastAction']);
    updateBadge();

    log('undo', `Ungrouped ${tabIdsToUngroup.length} tabs`);
    return { success: true, tabsUngrouped: tabIdsToUngroup.length };
}

/** Find duplicate tabs by exact normalized URL (not just domain) */
async function handleDetectDuplicates(): Promise<DuplicateGroup[]> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const urlMap: Record<string, { title: string; domain: string; tabIds: number[] }> = {};

    for (const tab of tabs) {
        if (!tab.url || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('brave://')) continue;
        const normalized = normalizeUrl(tab.url);
        if (!urlMap[normalized]) {
            urlMap[normalized] = {
                title: tab.title || '',
                domain: new URL(tab.url).hostname,
                tabIds: [],
            };
        }
        urlMap[normalized].tabIds.push(tab.id);
    }

    // Only return URLs with 2+ tabs (actual duplicates)
    return Object.entries(urlMap)
        .filter(([_, v]) => v.tabIds.length > 1)
        .map(([url, v]) => ({
            url,
            title: v.title,
            domain: v.domain,
            tabIds: v.tabIds,
            count: v.tabIds.length,
        }));
}

/** Close specific duplicate tab IDs (keeps the first, closes the rest) */
async function handleCloseDuplicates(tabIds: number[]): Promise<number> {
    if (!tabIds || tabIds.length === 0) return 0;

    // Ensure at least one tab remains
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    if (tabIds.length >= allTabs.length) {
        await chrome.tabs.create({ active: true });
    }

    await chrome.tabs.remove(tabIds);
    updateBadge();
    return tabIds.length;
}

/** Ungroup all tabs in browser groups matching a given name (all windows) */
async function handleRemoveBrowserGroup(groupName: string) {
    const groups = await chrome.tabGroups.query({});
    let tabsUngrouped = 0;

    for (const group of groups) {
        if (group.title === groupName) {
            const tabs = await chrome.tabs.query({ groupId: group.id });
            const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
            if (tabIds.length > 0) {
                await chrome.tabs.ungroup(tabIds);
                tabsUngrouped += tabIds.length;
            }
        }
    }

    updateBadge();
    log('remove-group', `Ungrouped ${tabsUngrouped} tabs from "${groupName}"`);
    return { success: true, tabsUngrouped };
}

/** Collapse or expand all tab groups in the current window */
async function handleToggleAllGroups(collapsed: boolean) {
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    for (const group of groups) {
        await chrome.tabGroups.update(group.id, { collapsed });
    }
    return { success: true, groupsUpdated: groups.length };
}

// ─── Feature 2: Stale tab handlers ─────────────────────────────────

/** Archive stale tabs into a workspace, then close them */
async function handleArchiveStaleTabs() {
    const staleTabs = await getStaleTabs();
    if (staleTabs.length === 0) return { success: true, archived: 0 };

    const dateName = new Date().toLocaleDateString();
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // Group stale tabs by their current group (or "Ungrouped")
    const byGroup: Record<string, typeof staleTabs> = {};
    for (const tab of staleTabs) {
        const key = tab.groupName || 'Ungrouped';
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(tab);
    }

    // Build workspace groups
    const groups = Object.entries(byGroup).map(([name, tabs]) => ({
        id: uid(),
        name,
        color: 'grey' as TabGroupColor,
        tabs: tabs.map(t => ({
            url: t.url,
            title: t.title,
            domain: t.domain,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }));

    // Save as workspace
    const existing = await getWorkspaces();
    existing.push({
        id: uid(),
        name: `Archived – ${dateName}`,
        groups,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    await saveWorkspaces(existing);

    // Close the stale tabs
    const tabIds = staleTabs.map(t => t.tabId);
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    if (tabIds.length >= allTabs.length) {
        await chrome.tabs.create({ active: true });
    }
    await chrome.tabs.remove(tabIds);

    await chrome.storage.local.set({ intellitab_stale_count: 0 });
    updateBadge();

    log('stale', `Archived ${staleTabs.length} stale tabs to "Archived – ${dateName}"`);
    return { success: true, archived: staleTabs.length, workspaceName: `Archived – ${dateName}` };
}

/** Open tabs that are in a workspace but not currently open */
async function handleRestoreMissingTabs(urls: string[]) {
    if (!urls || urls.length === 0) return { success: true, opened: 0 };
    let opened = 0;
    for (const url of urls) {
        try {
            await chrome.tabs.create({ url, active: false });
            opened++;
        } catch {
            // URL may be invalid
        }
    }
    return { success: true, opened };
}

/** Close specific stale tab IDs */
async function handleCloseStaleTabs(tabIds: number[]) {
    if (!tabIds || tabIds.length === 0) return { success: true, closed: 0 };

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    if (tabIds.length >= allTabs.length) {
        await chrome.tabs.create({ active: true });
    }
    await chrome.tabs.remove(tabIds);
    await chrome.storage.local.set({ intellitab_stale_count: 0 });
    updateBadge();

    return { success: true, closed: tabIds.length };
}
