import { TabInfo, Rule, AIResponse, LearnedPattern, AIConfig, LastAction, FeedbackResponse, GroupConfig, CorrectionDiff } from '../types';

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

    const indexToRealId: Record<number, number> = {};
    const indexedTabs = tabs.map((t, i) => {
        indexToRealId[i] = t.id;
        return { idx: i, domain: t.domain, url: t.url, title: t.title };
    });

    const preClassified: Record<string, number[]> = {};
    const unresolvedTabs: typeof indexedTabs = [];

    for (const tab of indexedTabs) {
        const matchedRule = rules.find(r =>
            r.type === 'group' && r.groupName && (
                tab.domain.includes(r.pattern) || tab.url.includes(r.pattern)
            )
        );
        if (matchedRule && matchedRule.groupName) {
            if (!preClassified[matchedRule.groupName]) preClassified[matchedRule.groupName] = [];
            preClassified[matchedRule.groupName].push(tab.idx);
        } else {
            unresolvedTabs.push(tab);
        }
    }

    if (unresolvedTabs.length === 0) {
        const groups = Object.entries(preClassified).map(([groupName, idxs]) => ({
            groupName,
            tabIds: idxs.map(i => indexToRealId[i])
        }));
        return { groups, closeRecommendations: [] };
    }

    const preClassifiedSummary = Object.entries(preClassified)
        .map(([group, idxs]) => `  ${group}: indices [${idxs.join(', ')}]`)
        .join('\n');

    const topPatterns = Object.entries(learnedPatterns)
        .map(([domain, groups]) => {
            const totalWeight = Object.values(groups).reduce((sum, w) => sum + w, 0);
            return { domain, groups, totalWeight };
        })
        .sort((a, b) => b.totalWeight - a.totalWeight)
        .slice(0, 50)
        .reduce((acc, curr) => {
            acc[curr.domain] = curr.groups;
            return acc;
        }, {} as LearnedPattern);

    const allowedGroups = groupConfigs
        .filter(c => c.permission === 'editable' || c.permission === 'append_only')
        .map(c => c.name);

    const customGroupsPrompt = allowedGroups.length > 0
        ? `- Use ONLY the following exact category names: ${allowedGroups.map(g => `"${g}"`).join(', ')}. Do NOT invent new categories.`
        : `- Use ONLY the category names from the SOUL naming convention. Do NOT invent new categories.`;

    const systemPrompt = `You are an AI tab organizer.

=== CORE TRUTH (SOUL) ===
${soulText}

=== LEARNED HISTORICAL PATTERNS ===
${JSON.stringify(topPatterns)}

=== ALREADY PRE-CLASSIFIED (do NOT re-classify these) ===
${preClassifiedSummary || '(none)'}

Requirements:
- Classify ONLY the unresolved tabs listed in the user message below.
- Use the tab "idx" field (a simple integer) as the identifier. Return these idx values in "tabIds".
- Place each idx in exactly ONE group. Do not duplicate. Do not skip any.
${customGroupsPrompt}
- Return ONLY valid JSON. No markdown wrapping.

Schema:
{
  "groups": [ { "groupName": "string", "tabIds": [number (idx values)] } ],
  "closeRecommendations": [number (idx values)]
}`;

    const baseUrl = getBaseUrl(config);
    const headers = getHeaders(config);
    const endpoint = isClaude(config) ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

    const body: any = {
        model: config.model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Classify these unresolved tabs:\n${JSON.stringify(unresolvedTabs)}` }
        ],
        temperature: 0.0
    };

    if (isClaude(config)) {
        // Adapt to Claude's format
        body.system = systemPrompt;
        body.messages = [
            { role: "user", content: `Classify these unresolved tabs:\n${JSON.stringify(unresolvedTabs)}` }
        ];
        body.max_tokens = 4096;
    } else {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`${config.provider.toUpperCase()} API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    let content = "";

    if (isClaude(config)) {
        content = data.content[0].text;
    } else {
        content = data.choices[0].message.content;
    }

    const llmResult = JSON.parse(content) as AIResponse;

    const mergedGroups: Record<string, number[]> = { ...preClassified };
    for (const g of llmResult.groups) {
        if (!mergedGroups[g.groupName]) mergedGroups[g.groupName] = [];
        mergedGroups[g.groupName].push(...g.tabIds);
    }

    const finalGroups = Object.entries(mergedGroups).map(([groupName, idxs]) => ({
        groupName,
        tabIds: idxs.map(i => indexToRealId[i] ?? i)
    }));

    const closeRecs = (llmResult.closeRecommendations || []).map(i => indexToRealId[i] ?? i);

    return { groups: finalGroups, closeRecommendations: closeRecs };
};

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

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
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

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
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
