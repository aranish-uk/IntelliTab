import { LearnedPattern } from '../types';

/**
 * Get all learned patterns from local storage
 */
export const getLearnedPatterns = async (): Promise<LearnedPattern> => {
    const result = await chrome.storage.local.get(['learnedPatterns']);
    return result.learnedPatterns || {};
};

/**
 * Save patterns to local storage
 */
export const saveLearnedPatterns = async (patterns: LearnedPattern): Promise<void> => {
    await chrome.storage.local.set({ learnedPatterns: patterns });
};

/**
 * Increment the association weight between a domain and a group name.
 * Default weight is 1.0 (manual grouping observed in real-time).
 */
export const logManualGrouping = async (domain: string, groupName: string, weight: number = 1): Promise<void> => {
    if (!domain || !groupName) return;

    const patterns = await getLearnedPatterns();

    if (!patterns[domain]) {
        patterns[domain] = {};
    }

    if (!patterns[domain][groupName]) {
        patterns[domain][groupName] = 0;
    }

    patterns[domain][groupName] += weight;

    await saveLearnedPatterns(patterns);
};

/**
 * Passive learning: learn from current browser group state with low confidence.
 * Called periodically (every few hours) to pick up how the user organizes over time.
 * Uses a low weight (0.3) to avoid overriding explicit feedback or rules.
 */
export const learnPassivelyFromCurrentGroups = async (): Promise<number> => {
    const PASSIVE_WEIGHT = 0.3;
    let learned = 0;

    try {
        const groups = await chrome.tabGroups.query({});
        for (const group of groups) {
            if (!group.title) continue;
            const tabs = await chrome.tabs.query({ groupId: group.id });
            for (const tab of tabs) {
                if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('brave://')) {
                    const domain = new URL(tab.url).hostname;
                    await logManualGrouping(domain, group.title, PASSIVE_WEIGHT);
                    learned++;
                }
            }
        }
    } catch (err) {
        console.error('[IntelliTab:passive-learn] Error:', err);
    }

    return learned;
};

/**
 * Learn from user corrections with moderate-high confidence.
 * When the user manually fixes AI grouping, these corrections carry more weight
 * than passive observations but less than explicit rules.
 */
export const logCorrectionLearning = async (domain: string, correctGroup: string, wrongGroup: string): Promise<void> => {
    const CORRECTION_WEIGHT = 2.0;
    const PENALTY_WEIGHT = -0.5;

    const patterns = await getLearnedPatterns();

    // Boost the correct group
    if (!patterns[domain]) patterns[domain] = {};
    if (!patterns[domain][correctGroup]) patterns[domain][correctGroup] = 0;
    patterns[domain][correctGroup] += CORRECTION_WEIGHT;

    // Penalize the wrong group (but don't go below 0)
    if (wrongGroup && wrongGroup !== 'ungrouped' && patterns[domain][wrongGroup] !== undefined) {
        patterns[domain][wrongGroup] = Math.max(0, patterns[domain][wrongGroup] + PENALTY_WEIGHT);
    }

    await saveLearnedPatterns(patterns);
};

/**
 * Get the SOUL.md truth text
 */
export const getSoulText = async (): Promise<string> => {
    const result = await chrome.storage.local.get(['soulText']);
    if (result.soulText !== undefined) {
        return result.soulText;
    }
    const defaultSoul = `# IntelliTab SOUL (Truth Source)
_version: 2.0 • explicit mode_

You are IntelliTab, a tab librarian. Goal: clean, scan-friendly groups. No junk drawers.

## Grouping Guidelines
1) Use EXACTLY the allowed groups defined in your settings. Do NOT invent new categories.
2) If a tab matches a STRICT RULE or LEARNED PATTERN, follow it immediately.
3) Never put the same tab in multiple groups.
4) If 1-2 tabs don't fit anywhere and aren't related, DO NOT group them (leave them uncategorized).

## Contextual Hints for Default Groups (Customize as needed)
* Work (Jobs, docs, spreadsheets, professional dashboards)
* Study (Canvas, university portals, course materials)
* Dev (GitHub, cloud consoles, programming, docs)
* Communication (Email, WhatsApp, messaging)
* Markets (Trading, finance, crypto, charts)
* Entertainment (YouTube, streaming, leisure)
* AI (ChatGPT, Claude)
* Read Later (Blogs, articles)

## Context Clues
- Look at the full "url" path. E.g. /assignment implies Study.
- Subgroups (e.g. "Dev - UI") ONLY if there are 4+ extremely similar tabs. Otherwise, stick to the main category.`;

    await chrome.storage.local.set({ soulText: defaultSoul });
    return defaultSoul;
};

/**
 * Save SOUL.md truth text
 */
export const saveSoulText = async (text: string): Promise<void> => {
    await chrome.storage.local.set({ soulText: text });
};

/**
 * Append a new correction block to SOUL while preventing unbounded growth.
 * Keeps the base guidance (everything before the first correction block)
 * plus the N most-recent correction blocks. Older blocks are dropped.
 */
export const appendSoulCorrectionBlock = async (
    block: string,
    keepRecent: number = 3,
    hardCapChars: number = 4000
): Promise<void> => {
    const current = await getSoulText();
    const marker = /^## Learned from User Corrections /m;
    const parts = current.split(marker);
    const base = parts[0].trimEnd();
    // parts[1..] are existing correction-block bodies (without the marker prefix)
    const existingBlocks = parts.slice(1).map(p => '## Learned from User Corrections ' + p.trim());
    const dated = `## Learned from User Corrections (${new Date().toLocaleDateString()})\n${block.trim()}`;

    const kept = [...existingBlocks, dated].slice(-keepRecent);
    let next = `${base}\n\n${kept.join('\n\n')}`;
    if (next.length > hardCapChars) {
        // Drop oldest kept blocks until we fit
        for (let n = kept.length - 1; n >= 1; n--) {
            const trimmed = `${base}\n\n${kept.slice(-n).join('\n\n')}`;
            if (trimmed.length <= hardCapChars) {
                next = trimmed;
                break;
            }
        }
        if (next.length > hardCapChars) next = next.slice(0, hardCapChars);
    }

    await saveSoulText(next);
};
