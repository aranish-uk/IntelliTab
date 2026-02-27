export interface TabInfo {
    id: number;
    url: string;
    title: string;
    domain: string;
    lastAccessed: number;
}

export interface Rule {
    id: string;
    type: 'group' | 'protect' | 'auto-close';
    pattern: string;
    groupName?: string;
    description?: string;
}

export interface GroqResponse {
    groups: {
        groupName: string;
        tabIds: number[];
    }[];
    closeRecommendations: number[];
}

export interface LearnedPattern {
    [domain: string]: {
        [groupName: string]: number; // weight/interaction count
    }
}

export interface LastAction {
    timestamp: number;
    tabsOrganized: number;
    groupsCreated: { groupName: string; tabCount: number; tabs: { title: string; domain: string }[] }[];
    closeRecommendations: number;
}

export interface FeedbackResponse {
    updatedSoul?: string;
    updatedPatterns?: LearnedPattern;
    responseMessage: string;
}
