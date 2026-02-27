import { classifyTabs, processFeedback } from './lib/groqClient';
import { getRules } from './lib/rulesEngine';
import { getLearnedPatterns, getSoulText, logManualGrouping, saveLearnedPatterns, saveSoulText } from './lib/learningEngine';
import { TabInfo, LastAction } from './types';

// Run on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.runtime.openOptionsPage();
});

// A command handler for messages from the popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'analyzeTabs') {
        handleAnalyzeTabs().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true; // indicates asynchronous response
    }
    if (request.action === 'groupTabs') {
        const fullTabsData = request.groups.map(async (g: any) => {
            const tabsData = await Promise.all(
                g.tabIds.map(async (id: number) => {
                    try {
                        const tab = await chrome.tabs.get(id);
                        return { title: tab.title || '', domain: tab.url ? new URL(tab.url).hostname : '' };
                    } catch {
                        return { title: 'Unknown', domain: 'unknown' };
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
                const action: LastAction = {
                    timestamp: Date.now(),
                    tabsOrganized: totalTabs,
                    groupsCreated,
                    closeRecommendations: 0
                };
                chrome.storage.local.set({ lastAction: action });
                sendResponse(res);
            }).catch(err => sendResponse({ error: err.message }));
        });
        return true;
    }
    if (request.action === 'processFeedback') {
        handleProcessFeedback(request.chatLog).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'ungroupAll') {
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
});

// Listener for automatic learning of manual tab grouping
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

async function handleAnalyzeTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabInfos: TabInfo[] = tabs.map(t => ({
        id: t.id!,
        url: t.url || '',
        title: t.title || '',
        domain: t.url ? new URL(t.url).hostname : '',
        lastAccessed: (t as any).lastAccessed || Date.now()
    }));

    const rules = await getRules();
    const learnedPatterns = await getLearnedPatterns();
    const soulText = await getSoulText();

    const storage = await chrome.storage.local.get(['groqApiKey']);
    const apiKey = storage.groqApiKey;

    if (!apiKey) {
        throw new Error('Groq API Key is not set.');
    }

    const result = await classifyTabs(tabInfos, rules, apiKey, soulText, learnedPatterns);
    return result;
}

async function handleGroupTabs(groups: { groupName: string, tabIds: number[] }[]) {
    for (const group of groups) {
        if (group.tabIds.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds: group.tabIds });
            // Apply title and state to fix Chrome visual bugs
            await chrome.tabGroups.update(groupId, { title: group.groupName, collapsed: false });
        }
    }
    return { success: true };
}

async function handleProcessFeedback(chatLog: { sender: 'user' | 'ai', message: string }[]) {
    const storage = await chrome.storage.local.get(['groqApiKey', 'lastAction']);
    const apiKey = storage.groqApiKey;
    if (!apiKey) throw new Error('Groq API Key is not set.');

    const soulText = await getSoulText();
    const learnedPatterns = await getLearnedPatterns();

    const lastAction = storage.lastAction || {
        timestamp: Date.now(),
        tabsOrganized: 0,
        groupsCreated: [],
        closeRecommendations: 0
    };

    const response = await processFeedback(chatLog, lastAction, soulText, learnedPatterns, apiKey);

    // Save updated items back to local storage automatically
    if (response.updatedSoul) await saveSoulText(response.updatedSoul);

    // Merge patterns if valid
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
