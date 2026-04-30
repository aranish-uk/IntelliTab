import { TabInfo, Rule, AIResponse, LearnedPattern, AIConfig, LastAction, FeedbackResponse, GroupConfig, CorrectionDiff, GroupSource, ClassifyTelemetryEvent } from '../types';

/** Confidence values keyed by classification source. */
const CONFIDENCE_BY_SOURCE: Record<GroupSource, number> = {
    rule: 1.0,
    pattern: 0.9,
    'llm-allowed': 0.7,
    'llm-new': 0.5,
    fallback: 0.3,
};

const TELEMETRY_KEY = 'intellitab_classify_telemetry';
const TELEMETRY_CAP = 50;

async function recordTelemetry(event: ClassifyTelemetryEvent): Promise<void> {
    try {
        const result = await chrome.storage.local.get([TELEMETRY_KEY]);
        const events: ClassifyTelemetryEvent[] = result[TELEMETRY_KEY] || [];
        events.push(event);
        const trimmed = events.slice(-TELEMETRY_CAP);
        await chrome.storage.local.set({ [TELEMETRY_KEY]: trimmed });
    } catch {
        // Telemetry must never break classification
    }
}

// ─── Classification pipeline helpers ────────────────────────────────

/**
 * Short-circuit threshold: a domain whose top group's weight clears this
 * gets assigned without ever calling the LLM. Tuned conservatively so we
 * only skip the LLM when the pattern is genuinely "rule-strong".
 */
const SHORT_CIRCUIT_WEIGHT = 4;
const STRONG_PATTERN_WEIGHT = 3; // Threshold for "show this to the LLM as strong"
const CLUSTER_DENSITY = 3;        // ≥ N same-host tabs → compress to one entry
const MIN_GROUP_SIZE = 2;         // Singletons get demoted unless pattern-justified

/** Canonical name aliases to kill the Dev/Development/Coding split. */
const NAME_ALIASES: Record<string, string> = {
    development: 'Dev', develop: 'Dev', coding: 'Dev', programming: 'Dev', code: 'Dev',
    studying: 'Study', school: 'Study', university: 'Study', course: 'Study', learning: 'Study',
    videos: 'Entertainment', leisure: 'Entertainment', media: 'Entertainment', streaming: 'Entertainment',
    chat: 'Communication', messaging: 'Communication', email: 'Communication', mail: 'Communication',
    finance: 'Markets', trading: 'Markets', crypto: 'Markets', stocks: 'Markets',
    work: 'Work', professional: 'Work', business: 'Work',
    ai: 'AI', llm: 'AI', chatbot: 'AI',
    shopping: 'Shopping', store: 'Shopping', commerce: 'Shopping',
    news: 'News', articles: 'Read Later', reading: 'Read Later', blog: 'Read Later',
};

function normalizeForCompare(s: string): string {
    return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function titleCase(s: string): string {
    return s.split(/\s+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Force the LLM's chosen group name into the canonical form when possible.
 * Order: alias map → exact-ish whitelist match → TitleCase fallback.
 */
function canonicalizeName(raw: string, allowedGroups: string[]): string {
    const norm = normalizeForCompare(raw);
    if (!norm) return 'Misc';

    if (NAME_ALIASES[norm]) return NAME_ALIASES[norm];

    for (const allowed of allowedGroups) {
        if (normalizeForCompare(allowed) === norm) return allowed;
    }
    // Substring match against allowed (e.g. "Web Dev" → "Dev"): prefer the shorter one
    for (const allowed of allowedGroups) {
        const a = normalizeForCompare(allowed);
        if (a.length >= 3 && (norm.includes(a) || a.includes(norm))) return allowed;
    }

    return titleCase(raw.trim());
}

/**
 * Filter learnedPatterns down to ONLY domains present in the current batch.
 * Eliminates the "top 50 globally" noise that drowned out the relevant signal.
 */
function selectPatternsForBatch(
    patterns: LearnedPattern,
    batchHosts: Set<string>
): LearnedPattern {
    const filtered: LearnedPattern = {};
    for (const host of batchHosts) {
        if (patterns[host]) filtered[host] = patterns[host];
    }
    return filtered;
}

/**
 * Compact text format for the prompt: "host → Group" lines.
 * Skips any host whose top group's weight is below threshold.
 */
function formatStrongPatterns(
    patterns: LearnedPattern,
    threshold: number = STRONG_PATTERN_WEIGHT
): string {
    const lines: string[] = [];
    for (const [host, groups] of Object.entries(patterns)) {
        const top = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= threshold) lines.push(`  - ${host} → ${top[0]}`);
    }
    return lines.length ? lines.join('\n') : '  (none yet)';
}

/**
 * For each tab whose domain has a top-group weight ≥ threshold, assign it
 * directly without calling the LLM. Returns the assignments + the remaining
 * tabs that still need classification.
 */
function shortCircuitByPattern(
    tabs: { idx: number; domain: string; url: string; title: string }[],
    patterns: LearnedPattern,
    threshold: number = SHORT_CIRCUIT_WEIGHT
): {
    assigned: Record<string, number[]>;
    remaining: typeof tabs;
} {
    const assigned: Record<string, number[]> = {};
    const remaining: typeof tabs = [];

    for (const tab of tabs) {
        const hostPatterns = patterns[tab.domain];
        if (hostPatterns) {
            const top = Object.entries(hostPatterns).sort((a, b) => b[1] - a[1])[0];
            if (top && top[1] >= threshold) {
                if (!assigned[top[0]]) assigned[top[0]] = [];
                assigned[top[0]].push(tab.idx);
                continue;
            }
        }
        remaining.push(tab);
    }
    return { assigned, remaining };
}

/**
 * If a host has ≥ density tabs, collapse them into a single LLM entry.
 * The cluster carries the original idxs so we can expand the LLM's decision
 * back to all of them locally. Mixed-intent hosts (count < density) are sent
 * individually so the LLM can see each title.
 */
function clusterByDomainIfDense(
    tabs: { idx: number; domain: string; url: string; title: string }[],
    density: number = CLUSTER_DENSITY
): {
    /** Items to actually send to the LLM */
    items: { i: number; host: string; path: string; title: string; clusterSize?: number; sampleTitles?: string[] }[];
    /** Map of LLM `i` → original tab idxs that share this decision */
    iToTabIdxs: Record<number, number[]>;
} {
    const byHost: Record<string, typeof tabs> = {};
    for (const t of tabs) {
        if (!byHost[t.domain]) byHost[t.domain] = [];
        byHost[t.domain].push(t);
    }

    const items: { i: number; host: string; path: string; title: string; clusterSize?: number; sampleTitles?: string[] }[] = [];
    const iToTabIdxs: Record<number, number[]> = {};
    let i = 0;

    for (const [host, hostTabs] of Object.entries(byHost)) {
        if (hostTabs.length >= density) {
            // Cluster: send one entry covering all of them
            const sample = hostTabs.slice(0, 3).map(t => t.title);
            items.push({
                i,
                host,
                path: extractPath(hostTabs[0].url),
                title: hostTabs[0].title,
                clusterSize: hostTabs.length,
                sampleTitles: sample,
            });
            iToTabIdxs[i] = hostTabs.map(t => t.idx);
            i++;
        } else {
            // Send individually so the LLM sees each title (mixed-intent hosts like youtube)
            for (const t of hostTabs) {
                items.push({
                    i,
                    host,
                    path: extractPath(t.url),
                    title: t.title,
                });
                iToTabIdxs[i] = [t.idx];
                i++;
            }
        }
    }
    return { items, iToTabIdxs };
}

/** Extract a compact path: first 2 segments. Strips tracking params. */
function extractPath(url: string): string {
    try {
        const u = new URL(url);
        const segs = u.pathname.split('/').filter(Boolean).slice(0, 2);
        return '/' + segs.join('/');
    } catch {
        return '';
    }
}

interface LLMClassifyOutput {
    groups: { name: string; ids: number[] }[];
}

interface ValidationResult {
    ok: boolean;
    reason?: string;
    sanitized?: LLMClassifyOutput;
}

/** Reject hallucinated indices, duplicates, and missing inputs. */
function validateLLMOutput(
    raw: unknown,
    inputIs: Set<number>
): ValidationResult {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
    const result = raw as Partial<LLMClassifyOutput>;
    if (!Array.isArray(result.groups)) return { ok: false, reason: 'missing groups[]' };

    const seen = new Set<number>();
    const cleanedGroups: { name: string; ids: number[] }[] = [];

    for (const g of result.groups) {
        if (!g || typeof g.name !== 'string' || !Array.isArray(g.ids)) {
            return { ok: false, reason: 'malformed group entry' };
        }
        const cleanIds: number[] = [];
        for (const id of g.ids) {
            if (typeof id !== 'number' || !inputIs.has(id)) continue; // drop hallucinated
            if (seen.has(id)) continue;                                // drop duplicate
            seen.add(id);
            cleanIds.push(id);
        }
        if (cleanIds.length > 0) cleanedGroups.push({ name: g.name, ids: cleanIds });
    }

    // Tabs the LLM didn't classify go to "Ungrouped" — not an error.
    const missing = [...inputIs].filter(i => !seen.has(i));
    if (missing.length > 0) {
        cleanedGroups.push({ name: 'Ungrouped', ids: missing });
    }

    return { ok: true, sanitized: { groups: cleanedGroups } };
}

/** Last-resort fallback: group everything by registrable domain. Better than wrong groups. */
function fallbackGroupByDomain(
    tabs: { idx: number; domain: string }[]
): { groupName: string; tabIds: number[] }[] {
    const byDomain: Record<string, number[]> = {};
    for (const t of tabs) {
        const sld = registrableDomain(t.domain);
        if (!byDomain[sld]) byDomain[sld] = [];
        byDomain[sld].push(t.idx);
    }
    return Object.entries(byDomain).map(([name, tabIds]) => ({
        groupName: titleCase(name) || 'Misc',
        tabIds,
    }));
}

function registrableDomain(host: string): string {
    const clean = host.replace(/^www\./, '');
    const parts = clean.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : clean;
}

/**
 * Demote singleton groups that have no pattern justification — they're usually
 * the LLM forcing a one-off into a category. Better in "Ungrouped".
 */
function enforceMinGroupSize(
    groups: { groupName: string; tabIds: number[] }[],
    patterns: LearnedPattern,
    tabHosts: Record<number, string>,
    minSize: number = MIN_GROUP_SIZE
): { groupName: string; tabIds: number[] }[] {
    const ungrouped: number[] = [];
    const survivors: { groupName: string; tabIds: number[] }[] = [];

    for (const g of groups) {
        if (g.groupName === 'Ungrouped') {
            ungrouped.push(...g.tabIds);
            continue;
        }
        if (g.tabIds.length >= minSize) {
            survivors.push(g);
            continue;
        }
        // Singleton: keep only if its host has a strong pattern for this group
        const tabId = g.tabIds[0];
        const host = tabHosts[tabId];
        const hostPatterns = host ? patterns[host] : undefined;
        const weight = hostPatterns?.[g.groupName] ?? 0;
        if (weight >= STRONG_PATTERN_WEIGHT) {
            survivors.push(g);
        } else {
            ungrouped.push(tabId);
        }
    }

    if (ungrouped.length > 0) {
        survivors.push({ groupName: 'Ungrouped', tabIds: ungrouped });
    }
    return survivors;
}

// ─── Rate-limit-aware fetch with exponential backoff ────────────────

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = MAX_RETRIES,
    backoff = INITIAL_BACKOFF_MS
): Promise<Response> {
    const response = await fetch(url, init);

    if (response.status === 429 && retries > 0) {
        // Check for Retry-After header (seconds)
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }

    return response;
}

const getBaseUrl = (config: AIConfig): string => {
    if (config.baseUrl) return config.baseUrl;
    switch (config.provider) {
        case 'openai': return 'https://api.openai.com/v1';
        case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta/openai';
        case 'claude': return 'https://api.anthropic.com/v1';
        case 'groq': return 'https://api.groq.com/openai/v1';
        case 'openrouter': return 'https://openrouter.ai/api/v1';
        default: return 'https://api.openai.com/v1';
    }
};

const getHeaders = (config: AIConfig): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (config.provider === 'claude') {
        headers['x-api-key'] = config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    if (config.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/ragebaiter/IntelliTab';
        headers['X-Title'] = 'IntelliTab';
    }

    return headers;
};

// Claude uses a different message structure than OpenAI-compatible APIs
const isClaude = (config: AIConfig) => config.provider === 'claude';

export const classifyTabs = async (
    tabs: TabInfo[],
    rules: Rule[],
    config: AIConfig,
    soulText: string,
    learnedPatterns: LearnedPattern,
    groupConfigs: GroupConfig[]
): Promise<AIResponse> => {
    if (!config.apiKey) {
        throw new Error(`${config.provider.toUpperCase()} API Key is missing. Please set it in the options page.`);
    }

    const startTime = Date.now();

    // ─── Step 0: index tabs ──────────────────────────────────────────
    const indexToRealId: Record<number, number> = {};
    const idxToHost: Record<number, string> = {};
    const indexedTabs = tabs.map((t, i) => {
        indexToRealId[i] = t.id;
        idxToHost[i] = t.domain;
        return { idx: i, domain: t.domain, url: t.url, title: t.title };
    });

    /** Tracks the strongest source for each group name. Promotes deterministically:
     * rule > pattern > llm-allowed > llm-new > fallback */
    const groupSources: Record<string, GroupSource> = {};
    const promote = (name: string, source: GroupSource) => {
        const current = groupSources[name];
        if (!current) { groupSources[name] = source; return; }
        const order: GroupSource[] = ['rule', 'pattern', 'llm-allowed', 'llm-new', 'fallback'];
        if (order.indexOf(source) < order.indexOf(current)) groupSources[name] = source;
    };

    // ─── Step 1: Rule pre-classification (deterministic) ─────────────
    const preClassified: Record<string, number[]> = {};
    let unresolvedTabs: typeof indexedTabs = [];
    let ruleAssigned = 0;
    for (const tab of indexedTabs) {
        const matched = rules.find(r =>
            r.type === 'group' && r.groupName && (
                tab.domain.includes(r.pattern) || tab.url.includes(r.pattern)
            )
        );
        if (matched && matched.groupName) {
            if (!preClassified[matched.groupName]) preClassified[matched.groupName] = [];
            preClassified[matched.groupName].push(tab.idx);
            promote(matched.groupName, 'rule');
            ruleAssigned++;
        } else {
            unresolvedTabs.push(tab);
        }
    }

    // ─── Step 2: Pattern short-circuit (skip LLM for confident matches) ─
    const { assigned: shortCircuited, remaining } = shortCircuitByPattern(
        unresolvedTabs,
        learnedPatterns,
        SHORT_CIRCUIT_WEIGHT
    );
    unresolvedTabs = remaining;
    let patternShortCircuited = 0;

    // Merge short-circuited into preClassified
    for (const [groupName, idxs] of Object.entries(shortCircuited)) {
        if (!preClassified[groupName]) preClassified[groupName] = [];
        preClassified[groupName].push(...idxs);
        promote(groupName, 'pattern');
        patternShortCircuited += idxs.length;
    }

    // Assemble allowed-group whitelist (settings + currently open browser groups)
    const allowedGroups = groupConfigs
        .filter(c => c.permission === 'editable' || c.permission === 'append_only')
        .map(c => c.name);
    let existingBrowserGroups: string[] = [];
    try {
        const browserGroups = await chrome.tabGroups.query({});
        existingBrowserGroups = [...new Set(browserGroups.map(g => g.title).filter(Boolean) as string[])];
    } catch { /* tabGroups may not be available */ }
    const allKnownGroups = [...new Set([...allowedGroups, ...existingBrowserGroups])];

    // If everything got resolved without an LLM call, we're done.
    if (unresolvedTabs.length === 0) {
        const result = finalize(preClassified, indexToRealId, learnedPatterns, idxToHost, allKnownGroups, groupSources);
        await recordTelemetry({
            ts: Date.now(),
            batchSize: tabs.length,
            ruleAssigned,
            patternShortCircuited,
            llmTabsSent: 0,
            llmClustersSent: 0,
            outputGroups: result.groups.length,
            validationRetries: 0,
            fellBackToDomain: false,
            durationMs: Date.now() - startTime,
        });
        return result;
    }

    // ─── Step 3: Cluster dense same-host tabs ────────────────────────
    const { items: llmItems, iToTabIdxs } = clusterByDomainIfDense(unresolvedTabs, CLUSTER_DENSITY);
    const validIs = new Set(llmItems.map(it => it.i));

    // ─── Step 4: Build prompt with ONLY relevant patterns + compact SOUL ─
    const batchHosts = new Set(unresolvedTabs.map(t => t.domain));
    const relevantPatterns = selectPatternsForBatch(learnedPatterns, batchHosts);
    const strongPatternsText = formatStrongPatterns(relevantPatterns, STRONG_PATTERN_WEIGHT);
    const compactedSoul = compactSoulForPrompt(soulText);

    const systemPrompt = buildClassifyPrompt(allKnownGroups, strongPatternsText, compactedSoul);

    // ─── Step 5: LLM call (with one retry on validation failure) ─────
    let llmGroups: { name: string; ids: number[] }[];
    let validationRetries = 0;
    let fellBackToDomain = false;
    try {
        llmGroups = await runClassifyCall(config, systemPrompt, llmItems, validIs);
    } catch (err) {
        console.warn('[IntelliTab:classify] LLM call failed, retrying with strict prompt:', err);
        validationRetries = 1;
        try {
            llmGroups = await runClassifyCall(
                config,
                systemPrompt + '\n\nIMPORTANT: Your previous response was malformed. Return STRICTLY valid JSON matching the schema, no extra fields.',
                llmItems,
                validIs
            );
        } catch (err2) {
            console.warn('[IntelliTab:classify] Retry failed, falling back to domain grouping:', err2);
            fellBackToDomain = true;
            const fallback = fallbackGroupByDomain(unresolvedTabs);
            for (const g of fallback) {
                if (!preClassified[g.groupName]) preClassified[g.groupName] = [];
                preClassified[g.groupName].push(...g.tabIds);
                promote(g.groupName, 'fallback');
            }
            const result = finalize(preClassified, indexToRealId, learnedPatterns, idxToHost, allKnownGroups, groupSources);
            await recordTelemetry({
                ts: Date.now(),
                batchSize: tabs.length,
                ruleAssigned,
                patternShortCircuited,
                llmTabsSent: unresolvedTabs.length,
                llmClustersSent: llmItems.length,
                outputGroups: result.groups.length,
                validationRetries,
                fellBackToDomain,
                durationMs: Date.now() - startTime,
            });
            return result;
        }
    }

    // ─── Step 6: Expand cluster decisions back to all tab idxs ───────
    const allowedSet = new Set(allowedGroups.map(g => normalizeForCompare(g)));
    for (const g of llmGroups) {
        const expandedIdxs: number[] = [];
        for (const i of g.ids) {
            const tabIdxs = iToTabIdxs[i];
            if (tabIdxs) expandedIdxs.push(...tabIdxs);
        }
        if (expandedIdxs.length === 0) continue;
        if (!preClassified[g.name]) preClassified[g.name] = [];
        preClassified[g.name].push(...expandedIdxs);
        // If the LLM picked a name that's already in the whitelist, that's a
        // higher-confidence decision than inventing a new one.
        const isAllowed = allowedSet.has(normalizeForCompare(g.name));
        promote(g.name, isAllowed ? 'llm-allowed' : 'llm-new');
    }

    const result = finalize(preClassified, indexToRealId, learnedPatterns, idxToHost, allKnownGroups, groupSources);
    await recordTelemetry({
        ts: Date.now(),
        batchSize: tabs.length,
        ruleAssigned,
        patternShortCircuited,
        llmTabsSent: unresolvedTabs.length,
        llmClustersSent: llmItems.length,
        outputGroups: result.groups.length,
        validationRetries,
        fellBackToDomain,
        durationMs: Date.now() - startTime,
    });
    return result;
};

/**
 * Single LLM call returning validated `{name, ids}[]`. Throws on validation
 * failure so the caller can retry or fall back.
 */
async function runClassifyCall(
    config: AIConfig,
    systemPrompt: string,
    items: { i: number; host: string; path: string; title: string; clusterSize?: number; sampleTitles?: string[] }[],
    validIs: Set<number>
): Promise<{ name: string; ids: number[] }[]> {
    const baseUrl = getBaseUrl(config);
    const headers = getHeaders(config);
    const endpoint = isClaude(config) ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

    const userContent = `Classify these tabs:\n${JSON.stringify(items)}`;

    const body: any = {
        model: config.model,
        temperature: 0.0,
        seed: 42,
    };

    if (isClaude(config)) {
        body.system = systemPrompt;
        body.messages = [{ role: 'user', content: userContent }];
        body.max_tokens = 4096;
    } else {
        body.messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
        ];
        body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
            throw new Error(`Rate limited by ${config.provider.toUpperCase()}.`);
        }
        throw new Error(`${config.provider.toUpperCase()} API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const content: string = isClaude(config) ? data.content[0].text : data.choices[0].message.content;

    const parsed = JSON.parse(content);
    const validation = validateLLMOutput(parsed, validIs);
    if (!validation.ok || !validation.sanitized) {
        throw new Error(`LLM validation failed: ${validation.reason}`);
    }
    return validation.sanitized.groups;
}

/**
 * Final assembly: canonicalize names, merge near-duplicates, enforce min size,
 * map idx → real tab id, and return AIResponse.
 */
function finalize(
    groups: Record<string, number[]>,
    indexToRealId: Record<number, number>,
    patterns: LearnedPattern,
    idxToHost: Record<number, string>,
    allowedGroups: string[],
    rawSources: Record<string, GroupSource>
): AIResponse {
    // Canonicalize names — track source through the rename
    const canonicalized: { groupName: string; tabIds: number[]; source: GroupSource }[] = [];
    for (const [rawName, idxs] of Object.entries(groups)) {
        const canonical = rawName === 'Ungrouped' ? 'Ungrouped' : canonicalizeName(rawName, allowedGroups);
        canonicalized.push({
            groupName: canonical,
            tabIds: idxs,
            source: rawSources[rawName] || 'llm-new',
        });
    }

    // Merge groups with the same canonical name; keep strongest source
    const sourceOrder: GroupSource[] = ['rule', 'pattern', 'llm-allowed', 'llm-new', 'fallback'];
    const mergedMap: Record<string, { tabIds: number[]; source: GroupSource }> = {};
    const order: string[] = [];
    for (const g of canonicalized) {
        if (!mergedMap[g.groupName]) {
            mergedMap[g.groupName] = { tabIds: [], source: g.source };
            order.push(g.groupName);
        }
        for (const id of g.tabIds) {
            if (!mergedMap[g.groupName].tabIds.includes(id)) mergedMap[g.groupName].tabIds.push(id);
        }
        if (sourceOrder.indexOf(g.source) < sourceOrder.indexOf(mergedMap[g.groupName].source)) {
            mergedMap[g.groupName].source = g.source;
        }
    }

    const merged = order.map(name => ({ groupName: name, tabIds: mergedMap[name].tabIds }));

    // Min-size enforcement
    const sized = enforceMinGroupSize(merged, patterns, idxToHost, MIN_GROUP_SIZE);

    // Drop synthetic "Ungrouped"
    const visible = sized.filter(g => g.groupName !== 'Ungrouped');

    // Map idx → real tab id; attach source + confidence
    const finalGroups: AIResponse['groups'] = visible.map(g => {
        const source = mergedMap[g.groupName]?.source || 'llm-new';
        return {
            groupName: g.groupName,
            tabIds: g.tabIds
                .map(i => indexToRealId[i])
                .filter((id): id is number => typeof id === 'number'),
            source,
            confidence: CONFIDENCE_BY_SOURCE[source],
        };
    }).filter(g => g.tabIds.length > 0);

    return { groups: finalGroups, closeRecommendations: [] };
}

/** Compact SOUL for prompt injection — hard cap at 800 chars. */
function compactSoulForPrompt(soul: string): string {
    if (soul.length <= 800) return soul;
    // Keep the base section (everything before the first correction block)
    // plus the most recent correction block.
    const splitMarker = /^## Learned from User Corrections /m;
    const blocks = soul.split(splitMarker);
    if (blocks.length <= 1) return soul.slice(0, 800);
    const base = blocks[0].trim();
    const lastCorrection = '## Learned from User Corrections ' + blocks[blocks.length - 1].trim();
    const compact = `${base}\n\n${lastCorrection}`;
    return compact.length <= 1200 ? compact : compact.slice(0, 1200);
}

/** Build the new, structured classify prompt. */
function buildClassifyPrompt(
    allowedGroups: string[],
    strongPatternsText: string,
    compactedSoul: string
): string {
    return `You are IntelliTab's tab classifier. Classify browser tabs into groups.

PRIORITY (highest first; stop at the first level that decides):
1. ALLOWED_GROUP_NAMES — if a tab fits any of these, use the EXACT string verbatim.
2. STRONG_PATTERNS — domain→group mappings observed from this user. Treat as near-rules.
3. SOUL — user's stated preferences. Honor unless 1 or 2 conflict.
4. Judgment — only when 1–3 don't decide.

ALLOWED_GROUP_NAMES (use these EXACT strings when applicable):
${allowedGroups.length ? allowedGroups.map(g => `  - ${g}`).join('\n') : '  (none configured)'}

STRONG_PATTERNS (only domains in the current batch; trust these):
${strongPatternsText}

SOUL (user preferences):
${compactedSoul}

INPUT FORMAT
Each tab is an object:
  { "i": integer id, "host": string, "path": string, "title": string,
    "clusterSize"?: integer (this entry represents N same-host tabs),
    "sampleTitles"?: string[] (titles of a few tabs in the cluster) }

RULES
- Each input "i" appears in exactly ONE group's "ids". Never duplicate, never skip.
- Use ALLOWED names verbatim. Inventing a new name is allowed ONLY if no allowed name fits AND the new group has ≥ 3 tabs.
- A tab that doesn't fit ANY group goes in the special group "Ungrouped".
- Group names: TitleCase, single word preferred (Dev, Study, Markets), no emoji, no punctuation, no quotes.
- Do not output close/archive recommendations. That is not your job here.

OUTPUT — return ONLY this JSON, nothing else:
{ "groups": [ { "name": "string", "ids": [integer, ...] } ] }

EXAMPLE
Input:
[{"i":0,"host":"github.com","path":"/foo/bar","title":"Issue #42"},
 {"i":1,"host":"stackoverflow.com","path":"/q/1","title":"How to..."},
 {"i":2,"host":"youtube.com","path":"/watch","title":"Music mix"}]
ALLOWED: Dev, Entertainment
STRONG_PATTERNS: github.com → Dev, stackoverflow.com → Dev
Output:
{"groups":[{"name":"Dev","ids":[0,1]},{"name":"Entertainment","ids":[2]}]}`;
}

export const processFeedback = async (
    chatLog: { sender: 'user' | 'ai', message: string }[],
    lastAction: LastAction,
    currentSoul: string,
    currentPatterns: LearnedPattern,
    config: AIConfig
): Promise<FeedbackResponse> => {
    if (!config.apiKey) {
        throw new Error(`${config.provider.toUpperCase()} API Key is missing. Please set it in the options page.`);
    }

    const systemPrompt = `You are an AI system tuner for a browser tab organizer.
The user is discussing the last grouping action you took or wants to give you behavioral feedback.

=== TRANSACTION MEMORY: LAST ACTION TAKEN ===
${JSON.stringify(lastAction)}

=== CURRENT SOUL TRUTH (Your Core Instructions) ===
${currentSoul}

=== CURRENT LEARNED PATTERNS ===
${JSON.stringify(currentPatterns).substring(0, 1000)}

Requirements:
1. Analyze the user's feedback in the conversation. Answer their questions contextually.
2. If the user wants to change a rule or fix a mistake, you can output an "updatedSoul".
3. If their feedback implies a direct domain-to-group mapping, you can output "updatedPatterns".
4. Always provide a conversational "responseMessage".
5. Return ONLY valid JSON. No markdown wrapping.

Schema:
{
  "updatedSoul": "string (Optional)",
  "updatedPatterns": { "domain_string": { "groupName": number } } (Optional),
  "responseMessage": "string"
}`;

    const lastUserMessage = chatLog[chatLog.length - 1].message;
    const history = chatLog.slice(0, -1).map(m => `${m.sender.toUpperCase()}: ${m.message}`).join("\n");

    const baseUrl = getBaseUrl(config);
    const headers = getHeaders(config);
    const endpoint = isClaude(config) ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

    const body: any = {
        model: config.model,
        messages: [],
        temperature: 0.2
    };

    if (isClaude(config)) {
        body.system = systemPrompt;
        if (history) {
            body.messages.push({ role: "user", content: `History:\n${history}\n\nLatest: ${lastUserMessage}` });
        } else {
            body.messages.push({ role: "user", content: lastUserMessage });
        }
        body.max_tokens = 4096;
    } else {
        body.messages.push({ role: "system", content: systemPrompt });
        if (history) {
            body.messages.push({ role: "user", content: `History:\n${history}` });
        }
        body.messages.push({ role: "user", content: lastUserMessage });
        body.response_format = { type: "json_object" };
    }

    const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
            throw new Error(`Rate limited by ${config.provider.toUpperCase()}. Please wait a moment and try again.`);
        }
        throw new Error(`${config.provider.toUpperCase()} API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    let content = "";
    if (isClaude(config)) {
        content = data.content[0].text;
    } else {
        content = data.choices[0].message.content;
    }

    return JSON.parse(content) as FeedbackResponse;
};

/**
 * Correction analysis response from AI
 */
export interface CorrectionAnalysis {
    /** Human-readable summary of what the user corrected and why */
    summary: string;
    /** Suggested SOUL amendments — soft guidance, not strict rules */
    soulSuggestions?: string;
    /** Domain→group pattern updates derived from corrections */
    updatedPatterns?: LearnedPattern;
}

/**
 * Analyze user corrections to AI grouping and suggest SOUL/pattern updates.
 *
 * The AI focuses on understanding WHY the user made changes:
 * - Bad grouping (wrong category for the content)
 * - Bad naming (group name doesn't fit the tabs)
 * - Missing context (AI didn't understand what the tab was for)
 * - User preference (subjective organization style)
 *
 * The response should be gentle suggestions, not strict rules,
 * to avoid over-constraining future grouping.
 */
export const processCorrections = async (
    diff: CorrectionDiff,
    currentSoul: string,
    currentPatterns: LearnedPattern,
    config: AIConfig
): Promise<CorrectionAnalysis> => {
    if (!config.apiKey) {
        throw new Error(`${config.provider.toUpperCase()} API Key is missing.`);
    }

    const systemPrompt = `You are an AI system tuner for IntelliTab, a browser tab organizer.

The user ran the AI tab organizer, then manually corrected the results. Your job is to:
1. Understand WHY each correction was made (not just WHAT changed)
2. Suggest gentle amendments to the SOUL (system instructions) if a pattern emerges
3. Suggest domain→group pattern updates for clear corrections

=== CURRENT SOUL ===
${currentSoul}

=== CURRENT LEARNED PATTERNS (top entries) ===
${JSON.stringify(currentPatterns).substring(0, 800)}

=== CORRECTIONS THE USER MADE ===
${JSON.stringify(diff, null, 2)}

Guidelines for your analysis:
- Focus on the REASON behind each change. Common reasons:
  * "Bad grouping" — the tab's content doesn't match the assigned group category
  * "Bad naming" — the group name was misleading or too broad/narrow
  * "User preference" — the user has a personal style (e.g. they consider GitHub as "Work" not "Dev")
  * "Context gap" — the AI couldn't tell what the page was about from URL/title alone
- For soulSuggestions: write soft guidance, not strict rules. Example:
  GOOD: "Consider that university portals with '/assignment' in URL are likely Study, not Work"
  BAD: "ALWAYS put university URLs in Study"
- For updatedPatterns: only include clear, unambiguous corrections. Use weight 2 for strong signals, 1 for moderate.
- If a group was renamed, think about whether the old name was wrong (suggest SOUL hint) or just a preference.
- If only 1-2 tabs were moved, it might be noise — mention it but don't overreact.
- Keep the summary conversational and brief.

Return ONLY valid JSON:
{
  "summary": "string — brief explanation of what the user corrected and why",
  "soulSuggestions": "string (optional) — soft amendments to add to SOUL, or null if none needed",
  "updatedPatterns": { "domain": { "groupName": weight } } (optional)
}`;

    const userMessage = `The user made ${diff.tabCorrections.length} tab corrections and ${diff.groupRenames.length} group renames after the AI organized their tabs. Analyze these corrections and suggest improvements.`;

    const baseUrl = getBaseUrl(config);
    const headers = getHeaders(config);
    const endpoint = isClaude(config) ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

    const body: any = {
        model: config.model,
        temperature: 0.3
    };

    if (isClaude(config)) {
        body.system = systemPrompt;
        body.messages = [{ role: 'user', content: userMessage }];
        body.max_tokens = 4096;
    } else {
        body.messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];
        body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
            throw new Error(`Rate limited by ${config.provider.toUpperCase()}. Please wait a moment and try again.`);
        }
        throw new Error(`${config.provider.toUpperCase()} API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    let content = '';
    if (isClaude(config)) {
        content = data.content[0].text;
    } else {
        content = data.choices[0].message.content;
    }

    return JSON.parse(content) as CorrectionAnalysis;
};
