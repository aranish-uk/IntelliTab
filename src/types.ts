export interface TabInfo {
    id: number;
    url: string;
    title: string;
    domain: string;
    groupId?: number;
    lastAccessed: number;
}

export interface Rule {
    id: string;
    type: 'group' | 'protect' | 'auto-close';
    pattern: string;
    groupName?: string;
    description?: string;
}

export interface LastAction {
    timestamp: number;
    tabsOrganized: number;
    groupsCreated: {
        groupName: string;
        tabCount: number;
        tabs: { title: string; domain: string; url?: string; }[];
    }[];
    closeRecommendations: number;
    groups?: {
        originalTabIds: number[];
        groupId: number;
        groupName: string;
    }[];
    /** URL-level mapping from the AI's original grouping, used for correction detection */
    urlToGroup?: Record<string, string>;
}

/** A single correction the user made after AI grouping */
export interface TabCorrection {
    url: string;
    title: string;
    domain: string;
    fromGroup: string;      // where AI put it (or 'ungrouped')
    toGroup: string;        // where user moved it (or 'ungrouped')
    correctionType: 'moved' | 'ungrouped' | 'newly_grouped';
}

/** A group rename detected after AI grouping */
export interface GroupRename {
    oldName: string;
    newName: string;
    tabCount: number;
}

/** Full diff between AI's grouping and user's corrections */
export interface CorrectionDiff {
    tabCorrections: TabCorrection[];
    groupRenames: GroupRename[];
    newGroupsCreated: string[];
    timestamp: number;
}

export type GroupPermission = 'editable' | 'locked' | 'append_only';

export interface GroupConfig {
    name: string;
    permission: GroupPermission;
}

export type AIProvider = 'openai' | 'gemini' | 'claude' | 'groq' | 'openrouter' | 'custom';

export interface AIProviderConfig {
    apiKey: string;
    baseUrl?: string;
    model: string;
}

export interface AIConfig {
    provider: AIProvider;
    apiKey: string;
    baseUrl?: string;
    model: string;
    savedConfigs?: Partial<Record<AIProvider, AIProviderConfig>>;
}

export interface AIResponse {
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

export interface FeedbackResponse {
    updatedSoul?: string;
    updatedPatterns?: LearnedPattern;
    responseMessage: string;
}

// ─── Workspace Persistence Types ────────────────────────────────────

/** Valid tab group colors from chrome.tabGroups.Color */
export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export const TAB_GROUP_COLORS: TabGroupColor[] = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

/** A single tab saved to IntelliTab's persistence layer */
export interface SavedTab {
    url: string;
    title: string;
    domain: string;
    favIconUrl?: string;
}

/** A logical group of tabs, independent of transient browser group IDs */
export interface SavedGroup {
    id: string;
    name: string;
    color: TabGroupColor;
    tabs: SavedTab[];
    createdAt: number;
    updatedAt: number;
}

/**
 * A workspace is a "group of groups" — a named collection of SavedGroups.
 * This is IntelliTab's internal concept, not a browser feature.
 */
export interface Workspace {
    id: string;
    name: string;
    groups: SavedGroup[];
    createdAt: number;
    updatedAt: number;
}

/**
 * Snapshot of the current browser grouping state, saved automatically
 * after every groupTabs operation as a recovery mechanism.
 * This is separate from user-created workspaces.
 */
export interface AutoSnapshot {
    groups: SavedGroup[];
    savedAt: number;
}
