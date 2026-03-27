import { classifyTabs, processFeedback, processCorrections } from './lib/aiClient';
import { getRules } from './lib/rulesEngine';
import { getLearnedPatterns, getSoulText, logManualGrouping, saveLearnedPatterns, saveSoulText, learnPassivelyFromCurrentGroups, logCorrectionLearning } from './lib/learningEngine';
import {
    autoSnapshotCurrentGroups,
    createWorkspaceFromCurrent,
    deleteWorkspace,
    getWorkspaces,
    restoreWorkspace,
    restoreSingleGroup,
    closeWorkspaceTabs,
    restoreFromAutoSnapshot,
    getAutoSnapshot,
    pickColor,
    normalizeUrl,
} from './lib/workspaceEngine';
import { TabInfo, LastAction, AIConfig, GroupConfig, TabGroupColor, TAB_GROUP_COLORS, CorrectionDiff, TabCorrection, GroupRename } from './types';

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

    let tabInfos: TabInfo[] = tabs.map(t => ({
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

    // Track which color index we've used so groups get distinct colors
    let colorIndex = 0;

    // Check what existing groups are already in the window to avoid color collisions
    const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    const usedColors = new Set(existingGroups.map(g => g.color));

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
            // Step 1: Create the group
            log('group', `Grouping ${validTabIds.length} tabs for "${group.groupName}"`);
            const groupId = await chrome.tabs.group({ tabIds: validTabIds });
            log('group', `Group created with browser ID ${groupId}`);

            // Step 2: Stabilization delay before updating metadata
            // This gives Brave time to register the group in its session state
            await delay(150);

            // Step 3: Pick a color that isn't already used
            let color: TabGroupColor = pickColor(colorIndex);
            while (usedColors.has(color) && colorIndex < TAB_GROUP_COLORS.length) {
                colorIndex++;
                color = pickColor(colorIndex);
            }
            usedColors.add(color);
            colorIndex++;

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

            // If AI suggests SOUL amendments, append them (don't overwrite)
            if (aiResult.soulSuggestions) {
                const currentSoul = await getSoulText();
                const amendedSoul = currentSoul + `\n\n## Learned from User Corrections (${new Date().toLocaleDateString()})\n${aiResult.soulSuggestions}`;
                await saveSoulText(amendedSoul);
                log('corrections', 'SOUL amended with correction insights');
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
