import { Rule } from '../types';

export const DEFAULT_RULES: Rule[] = [
    { id: '1', type: 'group', pattern: 'mail.google.com', groupName: 'Communication', description: 'Gmail' },
    { id: '2', type: 'group', pattern: 'web.whatsapp.com', groupName: 'Communication', description: 'WhatsApp' },
    { id: '3', type: 'group', pattern: 'github.com', groupName: 'Dev', description: 'GitHub' },
    { id: '4', type: 'group', pattern: 'vercel.com', groupName: 'Dev', description: 'Vercel' },
    { id: '5', type: 'group', pattern: 'chatgpt.com', groupName: 'AI', description: 'ChatGPT' },
    { id: '6', type: 'group', pattern: 'canvas', groupName: 'Study', description: 'Canvas LMS' },
    { id: '7', type: 'group', pattern: 'docs.google.com', groupName: 'Work', description: 'Google Docs' },
    { id: '8', type: 'group', pattern: 'tradingview.com', groupName: 'Markets', description: 'TradingView' },
    { id: '9', type: 'group', pattern: 'youtube.com', groupName: 'Entertainment', description: 'YouTube' }
];

export const getRules = async (): Promise<Rule[]> => {
    const result = await chrome.storage.local.get(['rules']);
    if (result.rules) {
        return result.rules;
    }
    await chrome.storage.local.set({ rules: DEFAULT_RULES });
    return DEFAULT_RULES;
};

export const saveRules = async (rules: Rule[]): Promise<void> => {
    await chrome.storage.local.set({ rules });
};
