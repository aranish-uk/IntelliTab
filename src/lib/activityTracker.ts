import { TabActivity, StaleTabConfig, DEFAULT_STALE_CONFIG } from '../types';

const ACTIVITY_KEY = 'intellitab_tab_activity';
const STALE_CONFIG_KEY = 'intellitab_stale_config';

// ─── Config ────────────────────────────────────────────────────────

export async function getStaleConfig(): Promise<StaleTabConfig> {
    const result = await chrome.storage.local.get([STALE_CONFIG_KEY]);
    return result[STALE_CONFIG_KEY] || DEFAULT_STALE_CONFIG;
}

export async function saveStaleConfig(config: StaleTabConfig): Promise<void> {
    await chrome.storage.local.set({ [STALE_CONFIG_KEY]: config });
}

// ─── Activity map CRUD ─────────────────────────────────────────────

async function getActivityMap(): Promise<Record<number, TabActivity>> {
    const result = await chrome.storage.local.get([ACTIVITY_KEY]);
    return result[ACTIVITY_KEY] || {};
}

async function saveActivityMap(map: Record<number, TabActivity>): Promise<void> {
    await chrome.storage.local.set({ [ACTIVITY_KEY]: map });
}

/** Record that a tab was activated (brought to foreground) */
export async function trackTabActivation(tabId: number): Promise<void> {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('brave://')) return;

        const map = await getActivityMap();
        const domain = new URL(tab.url).hostname;

        // Get group name if tab is grouped
        let groupName: string | undefined;
        if (tab.groupId && tab.groupId !== -1) {
            try {
                const group = await chrome.tabGroups.get(tab.groupId);
                groupName = group.title || undefined;
            } catch { /* group may not exist */ }
        }

        map[tabId] = {
            tabId,
            url: tab.url,
            title: tab.title || '',
            domain,
            lastActive: Date.now(),
            groupName,
        };

        await saveActivityMap(map);
    } catch {
        // Tab may have been closed between event and handler
    }
}

/** Remove a closed tab from the activity map */
export async function removeTabActivity(tabId: number): Promise<void> {
    const map = await getActivityMap();
    if (map[tabId]) {
        delete map[tabId];
        await saveActivityMap(map);
    }
}

/** Clean up entries for tabs that no longer exist */
export async function pruneActivityMap(): Promise<void> {
    const map = await getActivityMap();
    const allTabs = await chrome.tabs.query({});
    const liveIds = new Set(allTabs.map(t => t.id).filter((id): id is number => id !== undefined));

    let changed = false;
    for (const tabIdStr of Object.keys(map)) {
        if (!liveIds.has(Number(tabIdStr))) {
            delete map[Number(tabIdStr)];
            changed = true;
        }
    }

    if (changed) await saveActivityMap(map);
}

// ─── Stale detection ───────────────────────────────────────────────

/** Get tabs that haven't been activated within the threshold */
export async function getStaleTabs(thresholdHours?: number): Promise<TabActivity[]> {
    const config = await getStaleConfig();
    const hours = thresholdHours ?? config.staleAfterHours;
    const thresholdMs = hours * 60 * 60 * 1000;
    const now = Date.now();

    await pruneActivityMap();
    const map = await getActivityMap();

    // Also include open tabs that have NO activity entry (never been activated since tracking started)
    const allTabs = await chrome.tabs.query({});
    const trackedIds = new Set(Object.keys(map).map(Number));

    const staleTabs: TabActivity[] = [];

    // Check tracked tabs
    for (const activity of Object.values(map)) {
        if (now - activity.lastActive > thresholdMs) {
            staleTabs.push(activity);
        }
    }

    // Add untracked tabs (they've been open since before tracking started — treat as stale)
    for (const tab of allTabs) {
        if (!tab.id || !tab.url) continue;
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('brave://')) continue;
        if (tab.pinned) continue;
        if (trackedIds.has(tab.id)) continue;

        // Seed with a lastActive of now so they won't be stale until threshold passes
        // Don't include these as stale — just seed them
        const domain = new URL(tab.url).hostname;
        map[tab.id] = {
            tabId: tab.id,
            url: tab.url,
            title: tab.title || '',
            domain,
            lastActive: Date.now(),
        };
    }

    await saveActivityMap(map);
    return staleTabs;
}

/** Get count of stale tabs without full data (for badge/status) */
export async function getStaleTabCount(): Promise<number> {
    const tabs = await getStaleTabs();
    return tabs.length;
}
