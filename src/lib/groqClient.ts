import { TabInfo, Rule, GroqResponse, LearnedPattern, LastAction, FeedbackResponse } from '../types';

export const classifyTabs = async (
    tabs: TabInfo[],
    rules: Rule[],
    apiKey: string,
    soulText: string,
    learnedPatterns: LearnedPattern
): Promise<GroqResponse> => {
    if (!apiKey) {
        throw new Error('Groq API Key is missing. Please set it in the options page.');
    }

    // Step 1: Build a sequential index map (0, 1, 2...) to avoid LLM ID confusion
    const indexToRealId: Record<number, number> = {};
    const indexedTabs = tabs.map((t, i) => {
        indexToRealId[i] = t.id;
        return { idx: i, domain: t.domain, url: t.url, title: t.title };
    });

    // Step 2: Pre-classify tabs deterministically using rules
    const preClassified: Record<string, number[]> = {}; // groupName -> [indices]
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

    // Step 3: If all tabs are resolved by rules, skip the LLM entirely
    if (unresolvedTabs.length === 0) {
        const groups = Object.entries(preClassified).map(([groupName, idxs]) => ({
            groupName,
            tabIds: idxs.map(i => indexToRealId[i])
        }));
        return { groups, closeRecommendations: [] };
    }

    // Step 4: Build context for the LLM with only unresolved tabs
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
- Use ONLY the category names from the SOUL naming convention. Do NOT invent new categories.
- Return ONLY valid JSON. No markdown wrapping.

Schema:
{
  "groups": [ { "groupName": "string", "tabIds": [number (idx values)] } ],
  "closeRecommendations": [number (idx values)]
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Classify these unresolved tabs:\n${JSON.stringify(unresolvedTabs)}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.0
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const llmResult = JSON.parse(content) as GroqResponse;

    // Step 5: Merge pre-classified + LLM results, mapping indices back to real Chrome IDs
    const mergedGroups: Record<string, number[]> = { ...preClassified };
    for (const g of llmResult.groups) {
        if (!mergedGroups[g.groupName]) mergedGroups[g.groupName] = [];
        mergedGroups[g.groupName].push(...g.tabIds);
    }

    const finalGroups = Object.entries(mergedGroups).map(([groupName, idxs]) => ({
        groupName,
        tabIds: idxs.map(i => indexToRealId[i] ?? i) // map back to real Chrome IDs
    }));

    const closeRecs = (llmResult.closeRecommendations || []).map(i => indexToRealId[i] ?? i);

    return { groups: finalGroups, closeRecommendations: closeRecs };
};

export const processFeedback = async (
    chatLog: { sender: 'user' | 'ai', message: string }[],
    lastAction: LastAction,
    currentSoul: string,
    currentPatterns: LearnedPattern,
    apiKey: string
): Promise<FeedbackResponse> => {
    if (!apiKey) {
        throw new Error('Groq API Key is missing. Please set it in the options page.');
    }

    const systemPrompt = `You are an AI system tuner for a browser tab organizer.
The user is discussing the last grouping action you took or wants to give you behavioral feedback.

=== TRANSACTION MEMORY: LAST ACTION TAKEN ===
(The exact tabs you grouped last time)
${JSON.stringify(lastAction)}

=== CURRENT SOUL TRUTH (Your Core Instructions) ===
${currentSoul}

=== CURRENT LEARNED PATTERNS ===
${JSON.stringify(currentPatterns).substring(0, 1000)} // Truncated to prevent context overflow

Requirements:
1. Analyze the user's feedback in the conversation. Answer their questions contextually.
2. The user might just be asking "why did you group X in Y?". If so, just explain it based on the LAST ACTION and SOUL docs. DO NOT update the SOUL unless they explicitly ask you to change your behavior or rules.
3. If the user wants to change a rule or fix a mistake, you can output an "updatedSoul" with the new complete SOUL markdown text. If no changes are needed, omit this field entirely.
4. If their feedback implies a direct domain-to-group mapping, you can output "updatedPatterns". If no update is needed, omit this field entirely.
5. Always provide a conversational "responseMessage" answering the user directly, explaining what tabs were moved if they ask, and detailing what rules you updated if any.
6. Return ONLY valid JSON adhering to the exact schema provided. Do NOT wrap in markdown.

Schema:
{
  "updatedSoul": "string (Optional. The complete updated SOUL.md text)",
  "updatedPatterns": { "domain_string": { "groupName": number } } (Optional),
  "responseMessage": "string (Your conversational reply directly answering the user)"
}`;

    const lastUserMessage = chatLog[chatLog.length - 1].message;
    const history = chatLog.slice(0, -1).map(m => `${m.sender.toUpperCase()}: ${m.message}`).join("\n");

    const messages: any[] = [{ role: "system", content: systemPrompt }];
    if (history) {
        messages.push({ role: "user", content: `Previous Conversation History:\n${history}` });
    }
    messages.push({ role: "user", content: `New User Message: ${lastUserMessage}` });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages,
            response_format: { type: "json_object" },
            temperature: 0.2
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content) as FeedbackResponse;
};
