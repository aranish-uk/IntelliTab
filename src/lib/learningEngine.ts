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
 * Increment the association weight between a domain and a group name
 */
export const logManualGrouping = async (domain: string, groupName: string): Promise<void> => {
    if (!domain || !groupName) return;

    const patterns = await getLearnedPatterns();

    if (!patterns[domain]) {
        patterns[domain] = {};
    }

    if (!patterns[domain][groupName]) {
        patterns[domain][groupName] = 0;
    }

    patterns[domain][groupName] += 1;

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

## Top Guidelines
1) DO NOT invent categories. Use EXACTLY the Naming Convention. 
2) If a tab matches a STRICT RULE or LEARNED PATTERN, follow it immediately.
3) Never put the same tab in multiple groups.
4) If 1-2 tabs don't fit anywhere and aren't related, DO NOT group them (leave them uncategorized).

## Naming Convention (Use These or Existing Learned Patterns)
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
