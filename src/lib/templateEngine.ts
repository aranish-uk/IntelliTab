import { IntelliTabTemplate, GroupConfig } from '../types';
import { getLearnedPatterns, getSoulText, saveLearnedPatterns, saveSoulText } from './learningEngine';
import { getRules, saveRules } from './rulesEngine';

// ─── Export ────────────────────────────────────────────────────────

export async function exportTemplate(name: string, includePatterns: boolean): Promise<IntelliTabTemplate> {
    const soul = await getSoulText();
    const rules = await getRules();
    const configResult = await chrome.storage.local.get(['groupConfigs']);
    const groupConfigs: GroupConfig[] = configResult.groupConfigs || [];

    const template: IntelliTabTemplate = {
        version: '1.0',
        name,
        exportedAt: Date.now(),
        soul,
        rules,
        groupConfigs,
    };

    if (includePatterns) {
        template.learnedPatterns = await getLearnedPatterns();
    }

    return template;
}

export function downloadTemplate(template: IntelliTabTemplate): void {
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intellitab-${template.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ─── Validation ────────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    template?: IntelliTabTemplate;
}

export function validateTemplate(json: string): ValidationResult {
    const errors: string[] = [];

    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { valid: false, errors: ['Invalid JSON'] };
    }

    if (!parsed.version) errors.push('Missing version field');
    if (!parsed.name) errors.push('Missing name field');
    if (!parsed.soul || typeof parsed.soul !== 'string') errors.push('Missing or invalid soul field');
    if (!Array.isArray(parsed.rules)) errors.push('Missing or invalid rules array');
    if (!Array.isArray(parsed.groupConfigs)) errors.push('Missing or invalid groupConfigs array');

    if (errors.length > 0) return { valid: false, errors };

    // Validate rules structure
    for (const rule of parsed.rules) {
        if (!rule.id || !rule.type || !rule.pattern) {
            errors.push('Rule missing required fields (id, type, pattern)');
            break;
        }
    }

    // Validate group configs
    for (const gc of parsed.groupConfigs) {
        if (!gc.name || !gc.permission) {
            errors.push('GroupConfig missing required fields (name, permission)');
            break;
        }
    }

    if (errors.length > 0) return { valid: false, errors };
    return { valid: true, errors: [], template: parsed as IntelliTabTemplate };
}

// ─── Import ────────────────────────────────────────────────────────

export interface ImportOptions {
    mode: 'replace' | 'merge';
    importSoul: boolean;
    importRules: boolean;
    importGroups: boolean;
    importPatterns: boolean;
}

export async function importTemplate(template: IntelliTabTemplate, options: ImportOptions): Promise<{
    soulUpdated: boolean;
    rulesImported: number;
    groupsImported: number;
    patternsImported: number;
}> {
    let soulUpdated = false;
    let rulesImported = 0;
    let groupsImported = 0;
    let patternsImported = 0;

    // SOUL
    if (options.importSoul) {
        if (options.mode === 'replace') {
            await saveSoulText(template.soul);
        } else {
            const current = await getSoulText();
            await saveSoulText(current + '\n\n' + template.soul);
        }
        soulUpdated = true;
    }

    // Rules
    if (options.importRules) {
        if (options.mode === 'replace') {
            await saveRules(template.rules);
            rulesImported = template.rules.length;
        } else {
            const existing = await getRules();
            const existingPatterns = new Set(existing.map(r => r.pattern));
            const newRules = template.rules.filter(r => !existingPatterns.has(r.pattern));
            await saveRules([...existing, ...newRules]);
            rulesImported = newRules.length;
        }
    }

    // Group Configs
    if (options.importGroups) {
        if (options.mode === 'replace') {
            await chrome.storage.local.set({ groupConfigs: template.groupConfigs });
            groupsImported = template.groupConfigs.length;
        } else {
            const result = await chrome.storage.local.get(['groupConfigs']);
            const existing: GroupConfig[] = result.groupConfigs || [];
            const existingNames = new Set(existing.map(g => g.name.toLowerCase()));
            const newGroups = template.groupConfigs.filter(g => !existingNames.has(g.name.toLowerCase()));
            await chrome.storage.local.set({ groupConfigs: [...existing, ...newGroups] });
            groupsImported = newGroups.length;
        }
    }

    // Learned Patterns
    if (options.importPatterns && template.learnedPatterns) {
        if (options.mode === 'replace') {
            await saveLearnedPatterns(template.learnedPatterns);
            patternsImported = Object.keys(template.learnedPatterns).length;
        } else {
            const existing = await getLearnedPatterns();
            for (const [domain, groups] of Object.entries(template.learnedPatterns)) {
                if (!existing[domain]) existing[domain] = {};
                for (const [groupName, weight] of Object.entries(groups)) {
                    existing[domain][groupName] = (existing[domain][groupName] || 0) + weight;
                }
            }
            await saveLearnedPatterns(existing);
            patternsImported = Object.keys(template.learnedPatterns).length;
        }
    }

    return { soulUpdated, rulesImported, groupsImported, patternsImported };
}
