import { SyncConfig, DEFAULT_SYNC_CONFIG, GroupConfig } from '../types';
import { getSoulText, saveSoulText } from './learningEngine';
import { getRules, saveRules } from './rulesEngine';

const SYNC_CONFIG_KEY = 'intellitab_sync_config';
const SYNC_PREFIX = 'intellitab_sync_';

// ─── Config ────────────────────────────────────────────────────────

export async function getSyncConfig(): Promise<SyncConfig> {
    const result = await chrome.storage.local.get([SYNC_CONFIG_KEY]);
    return result[SYNC_CONFIG_KEY] || DEFAULT_SYNC_CONFIG;
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
    await chrome.storage.local.set({ [SYNC_CONFIG_KEY]: config });
}

// ─── Push to sync ──────────────────────────────────────────────────

export async function pushToSync(): Promise<void> {
    const config = await getSyncConfig();
    if (!config.enabled) return;

    const syncData: Record<string, any> = {
        [`${SYNC_PREFIX}timestamp`]: Date.now(),
    };

    if (config.syncSoul) {
        const soul = await getSoulText();
        // SOUL can be large — truncate to 7KB to stay under 8KB per-key limit
        syncData[`${SYNC_PREFIX}soul`] = soul.substring(0, 7000);
    }

    if (config.syncRules) {
        const rules = await getRules();
        syncData[`${SYNC_PREFIX}rules`] = JSON.stringify(rules);
    }

    if (config.syncGroups) {
        const result = await chrome.storage.local.get(['groupConfigs']);
        syncData[`${SYNC_PREFIX}groups`] = JSON.stringify(result.groupConfigs || []);
    }

    // Check total size before writing
    const totalSize = Object.values(syncData).reduce((sum, v) => sum + String(v).length, 0);
    if (totalSize > 90000) {
        console.warn('[IntelliTab:sync] Data too large for sync storage, skipping');
        return;
    }

    await chrome.storage.sync.set(syncData);

    // Update local config with timestamp
    config.lastSyncedAt = Date.now();
    await saveSyncConfig(config);
}

// ─── Pull from sync ────────────────────────────────────────────────

export async function pullFromSync(): Promise<{
    soulUpdated: boolean;
    rulesUpdated: boolean;
    groupsUpdated: boolean;
}> {
    const config = await getSyncConfig();
    if (!config.enabled) return { soulUpdated: false, rulesUpdated: false, groupsUpdated: false };

    const syncData = await chrome.storage.sync.get(null);
    let soulUpdated = false;
    let rulesUpdated = false;
    let groupsUpdated = false;

    // Check if remote data is newer than our last sync
    const remoteTimestamp = syncData[`${SYNC_PREFIX}timestamp`] || 0;
    if (remoteTimestamp <= (config.lastSyncedAt || 0)) {
        return { soulUpdated: false, rulesUpdated: false, groupsUpdated: false };
    }

    // SOUL: keep longer version (user likely added to it)
    if (config.syncSoul && syncData[`${SYNC_PREFIX}soul`]) {
        const remoteSoul = syncData[`${SYNC_PREFIX}soul`];
        const localSoul = await getSoulText();
        if (remoteSoul !== localSoul) {
            // Use the longer version
            if (remoteSoul.length > localSoul.length) {
                await saveSoulText(remoteSoul);
                soulUpdated = true;
            }
        }
    }

    // Rules: union by pattern (deduplicate)
    if (config.syncRules && syncData[`${SYNC_PREFIX}rules`]) {
        try {
            const remoteRules = JSON.parse(syncData[`${SYNC_PREFIX}rules`]);
            const localRules = await getRules();
            const localPatterns = new Set(localRules.map(r => r.pattern));
            const newRules = remoteRules.filter((r: any) => !localPatterns.has(r.pattern));
            if (newRules.length > 0) {
                await saveRules([...localRules, ...newRules]);
                rulesUpdated = true;
            }
        } catch { /* invalid JSON */ }
    }

    // Group configs: union by name
    if (config.syncGroups && syncData[`${SYNC_PREFIX}groups`]) {
        try {
            const remoteGroups: GroupConfig[] = JSON.parse(syncData[`${SYNC_PREFIX}groups`]);
            const result = await chrome.storage.local.get(['groupConfigs']);
            const localGroups: GroupConfig[] = result.groupConfigs || [];
            const localNames = new Set(localGroups.map(g => g.name.toLowerCase()));
            const newGroups = remoteGroups.filter(g => !localNames.has(g.name.toLowerCase()));
            if (newGroups.length > 0) {
                await chrome.storage.local.set({ groupConfigs: [...localGroups, ...newGroups] });
                groupsUpdated = true;
            }
        } catch { /* invalid JSON */ }
    }

    // Update local timestamp
    config.lastSyncedAt = Date.now();
    await saveSyncConfig(config);

    return { soulUpdated, rulesUpdated, groupsUpdated };
}

// ─── Debounced push ────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedPush(): void {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        pushToSync().catch(err => console.error('[IntelliTab:sync] Push failed:', err));
    }, 5000);
}
