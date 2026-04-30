import { ContextGroupConfig, DEFAULT_CONTEXT_GROUP, GroupConfig } from '../types';

const CONFIG_KEY = 'contextGroupConfig';

export async function getContextGroupConfig(): Promise<ContextGroupConfig> {
    const result = await chrome.storage.local.get([CONFIG_KEY]);
    return { ...DEFAULT_CONTEXT_GROUP, ...(result[CONFIG_KEY] || {}) };
}

export async function saveContextGroupConfig(config: ContextGroupConfig): Promise<void> {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

function isInheritableUrl(url: string | undefined): boolean {
    if (!url) return true; // about:blank during creation — still inheritable
    if (url.startsWith('chrome://newtab') || url === 'chrome://newtab/') return false;
    if (url.startsWith('edge://newtab') || url.startsWith('brave://newtab')) return false;
    return true;
}

function isNewTabPage(url: string | undefined): boolean {
    if (!url) return true;
    return url === 'chrome://newtab/'
        || url.startsWith('chrome://newtab')
        || url.startsWith('edge://newtab')
        || url.startsWith('brave://newtab')
        || url === 'about:blank';
}

async function isGroupWritable(groupId: number): Promise<boolean> {
    try {
        const group = await chrome.tabGroups.get(groupId);
        if (!group.title) return true;
        const result = await chrome.storage.local.get(['groupConfigs']);
        const configs: GroupConfig[] = result.groupConfigs || [];
        const cfg = configs.find(c => c.name === group.title);
        if (!cfg) return true;
        return cfg.permission !== 'locked';
    } catch {
        return false;
    }
}

/**
 * Tabs we have just placed via inheritance — used so other listeners
 * (passive learner, auto-organize burst counter) can ignore them.
 */
const recentlyInheritedTabs = new Set<number>();
export function wasInherited(tabId: number): boolean {
    return recentlyInheritedTabs.has(tabId);
}
function markInherited(tabId: number) {
    recentlyInheritedTabs.add(tabId);
    setTimeout(() => recentlyInheritedTabs.delete(tabId), 30_000);
}

/**
 * Inherit the opener's group on tab creation.
 * Pure fast path: no LLM, no rules, no patterns.
 */
export async function handleTabCreatedForInheritance(tab: chrome.tabs.Tab): Promise<void> {
    const config = await getContextGroupConfig();
    if (!config.contextInheritance) return;
    if (!tab.id) return;

    // Already grouped (e.g. duplicated tab carried its group) — leave alone.
    if (tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && tab.groupId !== -1) {
        return;
    }

    // Incognito gating
    if (tab.incognito && !config.includeIncognito) return;

    // Resolve a "context tab" whose group we'll inherit from.
    // 1a. Direct opener (link click, "open in new tab", window.open, etc.)
    // 1b. Cmd/Ctrl+T fallback — no opener but tab is a fresh newtab page.
    //     Inherit from whichever tab was active in this window before this one opened.
    let contextTab: chrome.tabs.Tab | null = null;

    if (tab.openerTabId !== undefined) {
        // 1a: opener path
        if (!isInheritableUrl(tab.pendingUrl || tab.url)) return;
        try {
            const opener = await chrome.tabs.get(tab.openerTabId);
            if (opener.windowId === tab.windowId) contextTab = opener;
        } catch {
            return;
        }
    } else if (config.activeTabFallback && isNewTabPage(tab.pendingUrl || tab.url)) {
        // 1b: Cmd+T fallback — only when URL looks like a fresh new-tab page.
        // We look for the tab that was active when this one opened. The newly
        // created tab itself becomes active immediately, so we filter it out.
        try {
            const candidates = await chrome.tabs.query({ active: true, windowId: tab.windowId });
            const prevActive = candidates.find(t => t.id !== tab.id) ?? null;
            // If the new tab is the *only* active tab returned (already focused),
            // fall back to the most-recently-accessed grouped tab in the window.
            if (prevActive) {
                contextTab = prevActive;
            } else {
                const allInWindow = await chrome.tabs.query({ windowId: tab.windowId });
                const grouped = allInWindow
                    .filter(t => t.id !== tab.id && t.groupId !== undefined && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && t.groupId !== -1)
                    .sort((a, b) => ((b as any).lastAccessed || 0) - ((a as any).lastAccessed || 0));
                contextTab = grouped[0] ?? null;
            }
        } catch {
            return;
        }
    } else {
        return; // External app, bookmark with no context, or fallback disabled
    }

    if (!contextTab) return;

    const ctxGroupId = contextTab.groupId;
    if (ctxGroupId === undefined || ctxGroupId === chrome.tabGroups.TAB_GROUP_ID_NONE || ctxGroupId === -1) {
        return;
    }

    if (!(await isGroupWritable(ctxGroupId))) return;

    try {
        await chrome.tabs.group({ tabIds: [tab.id], groupId: ctxGroupId });
        markInherited(tab.id);
    } catch (err) {
        console.warn('[IntelliTab:context] inherit failed', err);
    }
}

/**
 * Track the last-active group so we can collapse/expand on switch.
 */
let lastActiveGroupId: number | null = null;

export async function handleTabActivatedForFocus(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
    const config = await getContextGroupConfig();
    if (!config.focusActiveGroup) return;

    let tab: chrome.tabs.Tab;
    try {
        tab = await chrome.tabs.get(activeInfo.tabId);
    } catch {
        return;
    }

    const currGroupId = (tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && tab.groupId !== -1)
        ? tab.groupId
        : null;

    if (currGroupId === lastActiveGroupId) return;

    // Collapse the previously active group (only if still exists and not the same)
    if (lastActiveGroupId !== null && lastActiveGroupId !== currGroupId) {
        try {
            await chrome.tabGroups.update(lastActiveGroupId, { collapsed: true });
        } catch { /* group gone */ }
    }

    // Expand the current group
    if (currGroupId !== null) {
        try {
            await chrome.tabGroups.update(currGroupId, { collapsed: false });
        } catch { /* group gone */ }
    }

    lastActiveGroupId = currGroupId;
}

/**
 * Group all currently-highlighted tabs in the active window into a new group.
 * Triggered by the ALT+G keyboard command. Multi-select via Cmd/Shift-click
 * sets `highlighted: true` on each selected tab, including range selection.
 */
function suggestGroupName(tabs: chrome.tabs.Tab[]): string {
    // Pick the most common second-level domain among selected tabs.
    // Falls back to "New Group" if nothing useful is found.
    const counts: Record<string, number> = {};
    for (const t of tabs) {
        if (!t.url) continue;
        try {
            const host = new URL(t.url).hostname.replace(/^www\./, '');
            const parts = host.split('.');
            const sld = parts.length >= 2 ? parts[parts.length - 2] : host;
            if (!sld) continue;
            counts[sld] = (counts[sld] || 0) + 1;
        } catch { /* skip invalid */ }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return 'New Group';
    const [top, topCount] = sorted[0];
    // Only use the domain name if it dominates (>= half the tabs); otherwise generic.
    if (topCount >= Math.ceil(tabs.length / 2)) {
        return top.charAt(0).toUpperCase() + top.slice(1);
    }
    return 'New Group';
}

export async function groupHighlightedTabs(name?: string): Promise<{ grouped: number; groupId: number | null; name: string }> {
    const window = await chrome.windows.getLastFocused({ populate: false });
    if (!window.id) return { grouped: 0, groupId: null, name: '' };

    const highlighted = await chrome.tabs.query({ highlighted: true, windowId: window.id });
    const ids = highlighted.map(t => t.id).filter((id): id is number => id !== undefined);
    if (ids.length === 0) return { grouped: 0, groupId: null, name: '' };

    const finalName = name ?? suggestGroupName(highlighted);
    const groupId = await chrome.tabs.group({ tabIds: ids });
    try {
        await chrome.tabGroups.update(groupId, { title: finalName, collapsed: false });
    } catch { /* update is best-effort */ }
    return { grouped: ids.length, groupId, name: finalName };
}
