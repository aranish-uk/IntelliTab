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

/**
 * Where a classified group came from. Drives the confidence score and the
 * popup's "needs review?" UX.
 */
export type GroupSource = 'rule' | 'pattern' | 'llm-allowed' | 'llm-new' | 'fallback';

export interface ClassifiedGroup {
    groupName: string;
    tabIds: number[];
    /** 0–1, higher = more confident. See GroupSource for canonical mapping. */
    confidence?: number;
    source?: GroupSource;
}

export interface AIResponse {
    groups: ClassifiedGroup[];
    closeRecommendations: number[];
}

/** Telemetry event recorded after each classifyTabs call. Capped to last 50. */
export interface ClassifyTelemetryEvent {
    ts: number;
    batchSize: number;
    ruleAssigned: number;
    patternShortCircuited: number;
    llmTabsSent: number;
    llmClustersSent: number;
    outputGroups: number;
    validationRetries: number;
    fellBackToDomain: boolean;
    durationMs: number;
}

/** Confidence threshold below which a group is flagged for review in the popup. */
export const CONFIDENCE_REVIEW_THRESHOLD = 0.6;

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

// ─── Sprint 1 Feature Types ───────────────────────────────────────

/** Live tab statistics for the popup header */
export interface TabStats {
    total: number;
    grouped: number;
    ungrouped: number;
    groups: number;
    pinned: number;
}

/** A set of duplicate tabs sharing the same normalized URL */
export interface DuplicateGroup {
    url: string;
    title: string;
    domain: string;
    tabIds: number[];
    count: number;
}

/** User preferences for which popup tabs are visible */
export interface PopupSettings {
    showOrganize: boolean;
    showTools: boolean;
    showLearn: boolean;
    showWorkspaces: boolean;
    showRules: boolean;
}

export const DEFAULT_POPUP_SETTINGS: PopupSettings = {
    showOrganize: true,
    showTools: true,
    showLearn: true,
    showWorkspaces: true,
    showRules: true,
};

// ─── Feature 4: Group Templates ──────────────────────────────────

export interface IntelliTabTemplate {
    version: string;
    name: string;
    description?: string;
    exportedAt: number;
    soul: string;
    rules: Rule[];
    groupConfigs: GroupConfig[];
    learnedPatterns?: LearnedPattern;
}

// ─── Feature 5: Smart Workspace Suggestions ─────────────────────

export interface WorkspaceSuggestion {
    workspaceId: string;
    workspaceName: string;
    matchScore: number;
    matchedUrls: number;
    totalUrls: number;
    missingUrls: string[];
}

// ─── Feature 6: Cross-Device Sync ───────────────────────────────

export interface SyncConfig {
    enabled: boolean;
    syncSoul: boolean;
    syncRules: boolean;
    syncGroups: boolean;
    lastSyncedAt: number | null;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
    enabled: false,
    syncSoul: true,
    syncRules: true,
    syncGroups: true,
    lastSyncedAt: null,
};

/** Stored color assignments for group names across sessions */
export type ColorMap = Record<string, TabGroupColor>;

// ─── Feature 1: Context-Aware Grouping Triggers ──────────────────

export interface AutoOrganizeConfig {
    enabled: boolean;
    ungroupedThreshold: number;   // default: 12
    burstDetection: boolean;      // detect rapid tab opens
    burstWindow: number;          // ms window for burst (default: 5000)
    burstCount: number;           // tabs opened in window (default: 4)
    cooldownMinutes: number;      // min time between auto-organizes (default: 10)
}

// ─── Feature 2: Tab Aging / Stale Tab Cleanup ────────────────────

export interface TabActivity {
    tabId: number;
    url: string;
    title: string;
    domain: string;
    lastActive: number;       // timestamp of last activation
    groupName?: string;
}

export interface StaleTabConfig {
    enabled: boolean;
    staleAfterHours: number;  // default: 24
    checkIntervalMinutes: number; // default: 60
    autoArchive: boolean;     // auto-save to "Stale" workspace
}

export const DEFAULT_STALE_CONFIG: StaleTabConfig = {
    enabled: false,
    staleAfterHours: 24,
    checkIntervalMinutes: 60,
    autoArchive: false,
};

export const DEFAULT_AUTO_ORGANIZE: AutoOrganizeConfig = {
    enabled: false,
    ungroupedThreshold: 12,
    burstDetection: true,
    burstWindow: 5000,
    burstCount: 4,
    cooldownMinutes: 10,
};

// ─── Context-Aware Grouping (Non-LLM fast path) ──────────────────

export interface ContextGroupConfig {
    /** Inherit opener's group on tab creation */
    contextInheritance: boolean;
    /** Cmd/Ctrl+T fallback: inherit from previously-active tab when no opener */
    activeTabFallback: boolean;
    /** On tab activation, collapse previous group + expand current */
    focusActiveGroup: boolean;
    /** Enable ALT+G shortcut handler (manifest still needs the command) */
    manualShortcut: boolean;
    /** Apply inheritance in incognito windows */
    includeIncognito: boolean;
}

export const DEFAULT_CONTEXT_GROUP: ContextGroupConfig = {
    contextInheritance: true,
    activeTabFallback: true,
    focusActiveGroup: false,
    manualShortcut: true,
    includeIncognito: false,
};
