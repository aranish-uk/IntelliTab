import { classifyTabs, processFeedback } from './lib/aiClient';
import { getRules } from './lib/rulesEngine';
import { getLearnedPatterns, getSoulText, logManualGrouping, saveLearnedPatterns, saveSoulText } from './lib/learningEngine';
import { TabInfo, LastAction, AIConfig } from './types';

// Run on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.runtime.openOptionsPage();
    // Initialize default config if not present
    chrome.storage.local.get(['aiConfig', 'groqApiKey'], (result) => {
        if (!result.aiConfig) {
            const defaultConfig: AIConfig = {
                provider: 'groq',
                apiKey: result.groqApiKey || '',
                model: 'llama-3.3-70b-versatile'
            };
            chrome.storage.local.set({ aiConfig: defaultConfig });
        }
    });
});

async function getAIConfig(): Promise<AIConfig> {
    const result = await chrome.storage.local.get(['aiConfig', 'groqApiKey']);
    if (result.aiConfig) return result.aiConfig;

    // Migration logic
    const config: AIConfig = {
        provider: 'groq',
        apiKey: result.groqApiKey || '',
        model: 'llama-3.3-70b-versatile'
    };
    await chrome.storage.local.set({ aiConfig: config });
    return config;
}

// A command handler for messages from the popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'analyzeTabs') {
        handleAnalyzeTabs().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
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
    const aiConfig = await getAIConfig();

    if (!aiConfig.apiKey) {
        throw new Error(`${aiConfig.provider.toUpperCase()} API Key is not set.`);
    }

    const result = await classifyTabs(tabInfos, rules, aiConfig, soulText, learnedPatterns);
    return result;
}

async function handleGroupTabs(groups: { groupName: string, tabIds: number[] }[]) {
    for (const group of groups) {
        if (group.tabIds.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds: group.tabIds });
            await chrome.tabGroups.update(groupId, { title: group.groupName, collapsed: false });
        }
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

    // Save updated items back to local storage automatically
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
