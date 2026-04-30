import { WorkspaceSuggestion } from '../types';
import { getWorkspaces, normalizeUrl } from './workspaceEngine';

/**
 * Compare currently open tabs against saved workspaces.
 * Returns workspaces that match above the threshold, sorted by score.
 */
export async function detectWorkspaceMatch(threshold = 0.4): Promise<WorkspaceSuggestion[]> {
    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) return [];

    // Get all open tab URLs (normalized)
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const openUrls = new Set<string>();
    for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('brave://')) {
            openUrls.add(normalizeUrl(tab.url));
        }
    }

    const suggestions: WorkspaceSuggestion[] = [];

    for (const ws of workspaces) {
        // Collect all URLs in this workspace
        const wsUrls: string[] = [];
        for (const group of ws.groups) {
            for (const tab of group.tabs) {
                wsUrls.push(normalizeUrl(tab.url));
            }
        }

        if (wsUrls.length === 0) continue;

        // Count how many workspace URLs are currently open
        const matchedUrls = wsUrls.filter(url => openUrls.has(url)).length;
        const matchScore = matchedUrls / wsUrls.length;

        if (matchScore >= threshold) {
            const missingUrls = wsUrls.filter(url => !openUrls.has(url));
            suggestions.push({
                workspaceId: ws.id,
                workspaceName: ws.name,
                matchScore,
                matchedUrls,
                totalUrls: wsUrls.length,
                missingUrls,
            });
        }
    }

    // Sort by match score descending
    suggestions.sort((a, b) => b.matchScore - a.matchScore);
    return suggestions;
}
