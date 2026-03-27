import { SavedTab, SavedGroup, Workspace, AutoSnapshot, TabGroupColor, TAB_GROUP_COLORS } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────

/** Generate a simple unique ID (no crypto dependency needed) */
function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Normalize a URL for deduplication: strip trailing slash, fragment, and common tracking params */
export function normalizeUrl(raw: string): string {
    try {
        const u = new URL(raw);
        u.hash = '';
        // Remove common tracking parameters
        for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref']) {
            u.searchParams.delete(p);
        }
        let href = u.href;
        if (href.endsWith('/')) href = href.slice(0, -1);
        return href;
    } catch {
        return raw;
    }
}

/** Pick a color for a group, cycling through available colors */
export function pickColor(index: number): TabGroupColor {
    return TAB_GROUP_COLORS[index % TAB_GROUP_COLORS.length];
}

// ─── Storage: Workspaces ────────────────────────────────────────────

const WORKSPACES_KEY = 'intellitab_workspaces';
const AUTOSNAPSHOT_KEY = 'intellitab_autosnapshot';

export async function getWorkspaces(): Promise<Workspace[]> {
    const result = await chrome.storage.local.get([WORKSPACES_KEY]);
    return result[WORKSPACES_KEY] || [];
}

export async function saveWorkspaces(workspaces: Workspace[]): Promise<void> {
    await chrome.storage.local.set({ [WORKSPACES_KEY]: workspaces });
}

export async function getAutoSnapshot(): Promise<AutoSnapshot | null> {
    const result = await chrome.storage.local.get([AUTOSNAPSHOT_KEY]);
    return result[AUTOSNAPSHOT_KEY] || null;
}

export async function saveAutoSnapshot(snapshot: AutoSnapshot): Promise<void> {
    await chrome.storage.local.set({ [AUTOSNAPSHOT_KEY]: snapshot });
}

// ─── Snapshot: capture current browser groups ───────────────────────

/**
 * Read all tab groups in the current window and produce SavedGroup[].
 * This captures the live browser state into IntelliTab's internal model.
 */
export async function snapshotCurrentGroups(): Promise<SavedGroup[]> {
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    const savedGroups: SavedGroup[] = [];

    for (const group of groups) {
        if (!group.title) continue; // skip untitled groups
        const tabs = await chrome.tabs.query({ groupId: group.id, currentWindow: true });
        const savedTabs: SavedTab[] = tabs
            .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('brave://'))
            .map(t => ({
                url: t.url!,
                title: t.title || t.url!,
                domain: t.url ? new URL(t.url).hostname : '',
                favIconUrl: t.favIconUrl || undefined,
            }));

        if (savedTabs.length === 0) continue;

        savedGroups.push({
            id: uid(),
            name: group.title,
            color: (group.color as TabGroupColor) || 'grey',
            tabs: savedTabs,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }

    return savedGroups;
}

// ─── Workspace CRUD ─────────────────────────────────────────────────

/**
 * Save the current browser groups as a named workspace.
 * Returns the created workspace.
 */
export async function createWorkspaceFromCurrent(name: string): Promise<Workspace> {
    const groups = await snapshotCurrentGroups();
    const workspace: Workspace = {
        id: uid(),
        name,
        groups,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    const existing = await getWorkspaces();
    existing.push(workspace);
    await saveWorkspaces(existing);

    return workspace;
}

/**
 * Delete a workspace by ID.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
    const existing = await getWorkspaces();
    await saveWorkspaces(existing.filter(w => w.id !== workspaceId));
}

/**
 * Update a workspace's name.
 */
export async function renameWorkspace(workspaceId: string, newName: string): Promise<void> {
    const existing = await getWorkspaces();
    const ws = existing.find(w => w.id === workspaceId);
    if (ws) {
        ws.name = newName;
        ws.updatedAt = Date.now();
        await saveWorkspaces(existing);
    }
}

// ─── Tab matching for restoration ───────────────────────────────────

/**
 * Find an already-open tab that matches a saved tab URL.
 * Strategy: exact URL match first, then normalized URL fallback, then domain+path.
 */
function findMatchingTab(
    saved: SavedTab,
    openTabs: chrome.tabs.Tab[]
): chrome.tabs.Tab | undefined {
    const normalizedSaved = normalizeUrl(saved.url);

    // 1. Exact URL match
    const exact = openTabs.find(t => t.url === saved.url);
    if (exact) return exact;

    // 2. Normalized URL match
    const normalized = openTabs.find(t => t.url && normalizeUrl(t.url) === normalizedSaved);
    if (normalized) return normalized;

    // 3. Domain + pathname heuristic
    try {
        const savedUrl = new URL(saved.url);
        return openTabs.find(t => {
            if (!t.url) return false;
            try {
                const openUrl = new URL(t.url);
                return openUrl.hostname === savedUrl.hostname && openUrl.pathname === savedUrl.pathname;
            } catch { return false; }
        });
    } catch {
        return undefined;
    }
}

// ─── Restore ────────────────────────────────────────────────────────

export interface RestoreOptions {
    /** If true, reuse already-open tabs instead of creating duplicates */
    mergeExisting: boolean;
}

/**
 * Restore a full workspace: reopen all tabs, recreate all groups.
 * Returns the number of tabs restored.
 */
export async function restoreWorkspace(
    workspaceId: string,
    options: RestoreOptions = { mergeExisting: true }
): Promise<{ tabsRestored: number; groupsRestored: number }> {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    return restoreGroups(workspace.groups, options);
}

/**
 * Restore a single saved group from within a workspace.
 */
export async function restoreSingleGroup(
    workspaceId: string,
    groupId: string,
    options: RestoreOptions = { mergeExisting: true }
): Promise<{ tabsRestored: number; groupsRestored: number }> {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const group = workspace.groups.find(g => g.id === groupId);
    if (!group) throw new Error('Group not found in workspace');

    return restoreGroups([group], options);
}

/**
 * Core restoration logic: for each SavedGroup, open/reuse tabs then group them.
 * Uses stabilization delays to improve Brave persistence.
 */
async function restoreGroups(
    savedGroups: SavedGroup[],
    options: RestoreOptions
): Promise<{ tabsRestored: number; groupsRestored: number }> {
    const openTabs = await chrome.tabs.query({ currentWindow: true });
    const usedTabIds = new Set<number>(); // prevent reusing a tab for multiple groups
    let totalTabs = 0;
    let totalGroups = 0;

    for (let i = 0; i < savedGroups.length; i++) {
        const saved = savedGroups[i];
        const tabIds: number[] = [];

        for (const savedTab of saved.tabs) {
            let tab: chrome.tabs.Tab | undefined;

            if (options.mergeExisting) {
                tab = findMatchingTab(savedTab, openTabs.filter(t => t.id && !usedTabIds.has(t.id)));
            }

            if (tab && tab.id) {
                tabIds.push(tab.id);
                usedTabIds.add(tab.id);
            } else {
                // Open new tab
                try {
                    const newTab = await chrome.tabs.create({ url: savedTab.url, active: false });
                    if (newTab.id) {
                        tabIds.push(newTab.id);
                        usedTabIds.add(newTab.id);
                    }
                } catch (err) {
                    console.warn(`[IntelliTab] Failed to open tab for ${savedTab.url}:`, err);
                    // URL may be invalid or restricted — skip gracefully
                }
            }
        }

        if (tabIds.length === 0) continue;

        // Create the group with stabilization delays
        try {
            const groupId = await chrome.tabs.group({ tabIds });

            // Stabilization delay before updating metadata
            await delay(150);

            await chrome.tabGroups.update(groupId, {
                title: saved.name,
                color: saved.color,
                collapsed: false,
            });

            // Stabilization delay between groups
            await delay(100);

            totalTabs += tabIds.length;
            totalGroups++;
        } catch (err) {
            console.error(`[IntelliTab] Failed to create group "${saved.name}":`, err);
        }
    }

    return { tabsRestored: totalTabs, groupsRestored: totalGroups };
}

// ─── Close workspace tabs ───────────────────────────────────────────

/**
 * Close all tabs that belong to groups matching a workspace's group names.
 * Ensures at least one tab remains open (creates new tab if needed).
 */
export async function closeWorkspaceTabs(workspaceId: string): Promise<number> {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const wsUrls = new Set<string>();
    for (const g of workspace.groups) {
        for (const t of g.tabs) {
            wsUrls.add(normalizeUrl(t.url));
        }
    }

    const openTabs = await chrome.tabs.query({ currentWindow: true });
    const tabsToClose = openTabs.filter(t => t.url && wsUrls.has(normalizeUrl(t.url)));

    // Ensure at least one tab remains
    if (tabsToClose.length >= openTabs.length) {
        await chrome.tabs.create({ active: true });
    }

    const idsToClose = tabsToClose.map(t => t.id).filter((id): id is number => id !== undefined);
    if (idsToClose.length > 0) {
        await chrome.tabs.remove(idsToClose);
    }

    return idsToClose.length;
}

// ─── Auto-snapshot (shadow save) ────────────────────────────────────

/**
 * Automatically snapshot current groups after a grouping operation.
 * This provides recovery if Brave drops native group persistence.
 */
export async function autoSnapshotCurrentGroups(): Promise<void> {
    const groups = await snapshotCurrentGroups();
    if (groups.length > 0) {
        await saveAutoSnapshot({ groups, savedAt: Date.now() });
    }
}

/**
 * Restore from the auto-snapshot (recovery after browser restart).
 */
export async function restoreFromAutoSnapshot(
    options: RestoreOptions = { mergeExisting: true }
): Promise<{ tabsRestored: number; groupsRestored: number } | null> {
    const snapshot = await getAutoSnapshot();
    if (!snapshot || snapshot.groups.length === 0) return null;

    return restoreGroups(snapshot.groups, options);
}

// ─── Utility ────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
