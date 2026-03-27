/**
 * Generate all Chrome Web Store assets for IntelliTab:
 *   - 5 screenshots (1280x800, 24-bit PNG)
 *   - Small promo tile (440x280)
 *   - Marquee promo tile (1400x560)
 *   - Individual frames for video assembly
 *
 * Usage: node promo/generate-store-assets.mjs
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, 'assets');
const FRAMES = join(__dirname, 'video-frames');
[ASSETS, FRAMES].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

// ─── Design system ──────────────────────────────────────────────────

const COLORS = {
    bg: '#0a0a0a',
    card: '#141414',
    cardBorder: 'rgba(255,255,255,0.06)',
    text: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.55)',
    textMuted: 'rgba(255,255,255,0.35)',
    accent: '#6366f1',
    accentSoft: 'rgba(99,102,241,0.15)',
    pink: '#ec4899',
    cyan: '#06b6d4',
    green: '#22c55e',
    yellow: '#eab308',
    orange: '#f97316',
    red: '#ef4444',
    blue: '#3b82f6',
    purple: '#a855f7',
};

const fonts = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`;

const baseCSS = `
${fonts}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: ${COLORS.bg};
    color: ${COLORS.text};
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
}
.orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.25;
    pointer-events: none;
}
`;

const sparkle = (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`;

// ─── Popup frame component ─────────────────────────────────────────

function popupFrame(activeTab, bodyContent, opts = {}) {
    const tabs = ['ORGANIZE', 'LEARN', 'SPACES', 'RULES'];
    const tabsHTML = tabs.map(t => `
        <span style="flex:1; text-align:center; padding-bottom:12px; font-size:11px; font-weight:600;
            letter-spacing:0.8px; cursor:pointer;
            color:${t === activeTab ? '#fff' : 'rgba(255,255,255,0.35)'};
            border-bottom:${t === activeTab ? '2px solid #fff' : '2px solid transparent'};">${t}</span>
    `).join('');

    return `
    <div style="width:375px; background:#111; border-radius:16px; overflow:hidden;
        border:1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 80px rgba(0,0,0,0.6);">
        <!-- Header -->
        <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center;
            border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="color:rgba(255,255,255,0.4);">${sparkle(16)}</span>
                <span style="font-size:16px; font-weight:700; letter-spacing:-0.3px;">IntelliTab</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </div>
        <!-- Tabs -->
        <div style="display:flex; padding:8px 20px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
            ${tabsHTML}
        </div>
        <!-- Body -->
        <div style="padding:24px 20px; min-height:380px; display:flex; flex-direction:column; ${opts.bodyStyle || ''}">
            ${bodyContent}
        </div>
    </div>`;
}

// ─── Options frame component ────────────────────────────────────────

function optionsFrame(activeTab, bodyContent) {
    const tabs = ['Model', 'Groups', 'Workspaces', 'Feedback', 'Advanced'];
    const icons = {
        Model: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3"/></svg>`,
        Groups: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
        Workspaces: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        Feedback: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        Advanced: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/></svg>`,
    };
    const tabsHTML = tabs.map(t => `
        <span style="display:inline-flex; align-items:center; gap:6px; padding:10px 16px; font-size:13px; font-weight:500;
            color:${t === activeTab ? '#fff' : 'rgba(255,255,255,0.4)'};
            border-bottom:${t === activeTab ? '2px solid #6366f1' : '2px solid transparent'};">
            ${icons[t]}${t}
        </span>
    `).join('');

    return `
    <div style="width:680px; background:#111; border-radius:16px; overflow:hidden;
        border:1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 80px rgba(0,0,0,0.6);">
        <!-- Header -->
        <div style="text-align:center; padding:24px 0 0;">
            <div style="display:inline-flex; align-items:center; gap:8px; color:rgba(255,255,255,0.5);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4"/></svg>
            </div>
            <h1 style="font-size:22px; font-weight:800; margin-top:4px;">IntelliTab</h1>
            <p style="font-size:12px; color:rgba(255,255,255,0.4); margin-top:2px;">AI-powered tab organizer & memory core</p>
        </div>
        <!-- Tabs -->
        <div style="display:flex; justify-content:center; gap:4px; padding:16px 20px 0;
            border-bottom:1px solid rgba(255,255,255,0.06);">
            ${tabsHTML}
        </div>
        <!-- Body -->
        <div style="padding:28px 32px; min-height:380px;">
            ${bodyContent}
        </div>
    </div>`;
}

// ─── Screenshot layouts ─────────────────────────────────────────────

function screenshotWrapper(caption, subtitle, leftContent, rightContent = '', layout = 'center') {
    const captionHTML = `
        <div style="position:absolute; top:50px; left:0; right:0; text-align:center; z-index:10;">
            <h2 style="font-size:36px; font-weight:800; letter-spacing:-1px; line-height:1.2;">${caption}</h2>
            <p style="font-size:16px; color:${COLORS.textSecondary}; margin-top:8px; max-width:500px; display:inline-block; line-height:1.5;">${subtitle}</p>
        </div>
    `;

    if (layout === 'center') {
        return `
        <div style="position:relative; width:1280px; height:800px; display:flex; align-items:center; justify-content:center;">
            <div class="orb" style="width:500px;height:500px;background:radial-gradient(circle,${COLORS.accent},transparent);top:-100px;right:-50px;"></div>
            <div class="orb" style="width:400px;height:400px;background:radial-gradient(circle,${COLORS.pink},transparent);bottom:-80px;left:-40px;"></div>
            ${captionHTML}
            <div style="margin-top:100px;">
                ${leftContent}
            </div>
        </div>`;
    }

    // side-by-side layout
    return `
    <div style="position:relative; width:1280px; height:800px; display:flex; align-items:center; justify-content:center; gap:50px;">
        <div class="orb" style="width:500px;height:500px;background:radial-gradient(circle,${COLORS.accent},transparent);top:-100px;right:-50px;"></div>
        <div class="orb" style="width:400px;height:400px;background:radial-gradient(circle,${COLORS.pink},transparent);bottom:-80px;left:-40px;"></div>
        <div class="orb" style="width:300px;height:300px;background:radial-gradient(circle,${COLORS.cyan},transparent);top:40%;left:35%;"></div>
        ${captionHTML}
        <div style="margin-top:80px;">${leftContent}</div>
        <div style="margin-top:80px;">${rightContent}</div>
    </div>`;
}

// ─── Screenshot 1: Organize ─────────────────────────────────────────

const screenshot1 = () => {
    const organizeBody = `
        <div style="text-align:center; display:flex; flex-direction:column; align-items:center; gap:16px; margin-top:10px;">
            <div style="width:56px;height:56px;border-radius:14px;background:rgba(255,255,255,0.05);
                display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.35);">
                ${sparkle(28)}
            </div>
            <div>
                <h2 style="font-size:15px;font-weight:700;">Ready to organize?</h2>
                <p style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:4px;max-width:220px;line-height:1.5;">
                    Let AI analyze and sort your open tabs into logical groups.
                </p>
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,0.5);">
                <div style="width:14px;height:14px;border:1.5px solid rgba(255,255,255,0.25);border-radius:3px;"></div>
                Only organize ungrouped tabs
            </label>
            <button style="width:100%;padding:14px;border-radius:12px;background:#fff;color:#000;
                font-size:13px;font-weight:600;border:none;display:flex;align-items:center;justify-content:center;gap:8px;">
                <span style="color:#000;">${sparkle(16)}</span>
                Analyze Tabs
            </button>
            <button style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,0.05);
                color:rgba(255,255,255,0.5);font-size:11px;border:1px solid rgba(255,255,255,0.08);">
                Ungroup All
            </button>
        </div>
    `;

    // Results panel
    const resultsPanel = `
    <div style="width:340px; background:#111; border-radius:16px; overflow:hidden;
        border:1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 80px rgba(0,0,0,0.6); padding:20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span style="font-size:13px;font-weight:600;">Suggested Groups</span>
        </div>
        ${[
            { name: 'Dev', count: 17, color: COLORS.blue },
            { name: 'Study', count: 8, color: COLORS.yellow },
            { name: 'Communication', count: 5, color: COLORS.green },
            { name: 'Markets', count: 4, color: COLORS.orange },
            { name: 'AI', count: 3, color: COLORS.purple },
            { name: 'Entertainment', count: 2, color: COLORS.red },
        ].map(g => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
                border-radius:8px;background:rgba(255,255,255,0.03);margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:8px;height:8px;border-radius:50%;background:${g.color};"></div>
                    <span style="font-size:12px;font-weight:500;">${g.name}</span>
                </div>
                <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.06);
                    color:rgba(255,255,255,0.5);">${g.count}</span>
            </div>
        `).join('')}
        <button style="width:100%;padding:11px;border-radius:8px;background:#fff;color:#000;
            font-size:12px;font-weight:600;border:none;margin-top:10px;">
            Apply Grouping
        </button>
    </div>`;

    return screenshotWrapper(
        'One-Click AI Organization',
        'Analyze all your tabs and sort them into smart groups instantly',
        popupFrame('ORGANIZE', organizeBody),
        resultsPanel,
        'side'
    );
};

// ─── Screenshot 2: Learn ────────────────────────────────────────────

const screenshot2 = () => {
    const learnBody = `
        <div style="text-align:center; display:flex; flex-direction:column; align-items:center; gap:14px; margin-top:6px;">
            <div style="width:56px;height:56px;border-radius:14px;background:rgba(255,255,255,0.05);
                display:flex;align-items:center;justify-content:center;font-size:26px;">
                &#128077;
            </div>
            <div>
                <h2 style="font-size:15px;font-weight:700;">This is how I like it</h2>
                <p style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:4px;max-width:250px;line-height:1.5;">
                    After AI organizes your tabs, make any corrections you want, then click below. IntelliTab will learn from your changes.
                </p>
            </div>
            <button style="width:100%;padding:14px;border-radius:12px;background:#fff;color:#000;
                font-size:13px;font-weight:600;border:none;display:flex;align-items:center;justify-content:center;gap:8px;">
                &#128077; Learn from my corrections
            </button>
            <p style="font-size:10px;color:rgba(255,255,255,0.3);">Compares your current tabs to the last AI grouping</p>
            <div style="width:100%;display:flex;align-items:center;gap:12px;">
                <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
                <span style="font-size:10px;color:rgba(255,255,255,0.25);">or</span>
                <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
            </div>
            <button style="width:100%;padding:14px;border-radius:12px;background:rgba(255,255,255,0.06);
                color:rgba(255,255,255,0.6);font-size:13px;font-weight:500;border:1px solid rgba(255,255,255,0.08);
                display:flex;align-items:center;justify-content:center;gap:8px;">
                &#10004; This is how I like my tabs
            </button>
            <p style="font-size:10px;color:rgba(255,255,255,0.3);">Learns from your current groups — no AI run needed</p>
        </div>
    `;

    // Learning weights panel
    const weightsPanel = `
    <div style="width:320px; display:flex; flex-direction:column; gap:14px;">
        <div style="background:#141414; border-radius:14px; padding:20px; border:1px solid rgba(255,255,255,0.06);">
            <h3 style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:0.8px;margin-bottom:14px;">
                CONFIDENCE LEVELS
            </h3>
            ${[
                { method: 'Passive', desc: 'Every 3 hours', weight: '0.3', color: COLORS.cyan, width: '30%' },
                { method: 'Manual', desc: 'Group listener', weight: '1.0', color: COLORS.yellow, width: '60%' },
                { method: 'Corrections', desc: 'User fixes AI', weight: '2.0', color: COLORS.pink, width: '85%' },
                { method: 'Explicit', desc: '"I like this"', weight: '2.0', color: COLORS.green, width: '85%' },
            ].map(l => `
                <div style="margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <span style="font-size:11px;font-weight:600;">${l.method}</span>
                        <span style="font-size:10px;color:rgba(255,255,255,0.35);">${l.desc} &middot; ${l.weight}x</span>
                    </div>
                    <div style="width:100%;height:6px;border-radius:3px;background:rgba(255,255,255,0.05);">
                        <div style="width:${l.width};height:100%;border-radius:3px;background:${l.color};opacity:0.7;"></div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div style="background:#141414; border-radius:14px; padding:20px; border:1px solid rgba(255,255,255,0.06);">
            <h3 style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:0.8px;margin-bottom:10px;">
                LEARNED PATTERNS
            </h3>
            ${[
                { domain: 'github.com', group: 'Dev', weight: 12.4 },
                { domain: 'canvas.tum.de', group: 'Study', weight: 8.2 },
                { domain: 'mail.google.com', group: 'Communication', weight: 6.1 },
                { domain: 'youtube.com', group: 'Entertainment', weight: 4.8 },
            ].map(p => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;
                    border-bottom:1px solid rgba(255,255,255,0.04);">
                    <span style="font-size:10px;color:rgba(255,255,255,0.5);">${p.domain}</span>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:10px;font-weight:600;">${p.group}</span>
                        <span style="font-size:9px;color:rgba(255,255,255,0.3);">${p.weight}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>`;

    return screenshotWrapper(
        'Learns How You Work',
        'Passively observes, learns from corrections, adapts over time',
        popupFrame('LEARN', learnBody),
        weightsPanel,
        'side'
    );
};

// ─── Screenshot 3: Workspaces ───────────────────────────────────────

const screenshot3 = () => {
    const spacesBody = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <!-- Save section -->
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
                border-radius:12px;padding:14px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                    <span style="font-size:14px;">&#128451;</span>
                    <span style="font-size:12px;font-weight:600;">Save Workspace</span>
                </div>
                <p style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:10px;">
                    Snapshot all current tab groups into a named workspace.
                </p>
                <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <div style="flex:1;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.04);
                        border:1px solid rgba(255,255,255,0.08);font-size:11px;color:rgba(255,255,255,0.3);">
                        Workspace name (e.g. Masters)
                    </div>
                    <div style="padding:8px 10px;border-radius:8px;background:#fff;color:#000;font-size:11px;">
                        &#128190;
                    </div>
                </div>
                <div style="display:flex;gap:16px;">
                    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.35);">
                        <div style="width:12px;height:12px;border:1.5px solid rgba(255,255,255,0.2);border-radius:2px;"></div>
                        Close after save
                    </label>
                    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.35);">
                        <div style="width:12px;height:12px;border-radius:2px;background:#ec4899;display:flex;
                            align-items:center;justify-content:center;">
                            <span style="color:#fff;font-size:8px;font-weight:800;">&#10003;</span>
                        </div>
                        Merge on restore
                    </label>
                </div>
            </div>
            <!-- Workspace item -->
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
                border-radius:12px;padding:12px 14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="color:rgba(255,255,255,0.3);font-size:10px;">&#9654;</span>
                        <span style="font-size:12px;font-weight:600;">Masters</span>
                    </div>
                    <span style="font-size:10px;padding:3px 8px;border-radius:10px;
                        background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);">14 groups</span>
                </div>
            </div>
        </div>
    `;

    // Workspace details panel
    const detailsPanel = `
    <div style="width:380px; background:#141414; border-radius:16px; padding:24px;
        border:1px solid rgba(255,255,255,0.06); box-shadow: 0 25px 80px rgba(0,0,0,0.4);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <h3 style="font-size:16px;font-weight:700;">Masters</h3>
            <span style="font-size:10px;color:rgba(255,255,255,0.3);">14 groups &middot; 57 tabs</span>
        </div>
        <p style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:16px;">Saved 3/25/2026</p>
        <div style="display:flex;flex-direction:column;gap:4px;">
            ${[
                { name: 'Italian', color: COLORS.blue, tabs: 5 },
                { name: 'TUM', color: COLORS.red, tabs: 4 },
                { name: 'TUB', color: COLORS.yellow, tabs: 3 },
                { name: 'Edinburgh', color: COLORS.green, tabs: 4 },
                { name: 'UCL', color: COLORS.pink, tabs: 5 },
                { name: 'Glasgow', color: COLORS.purple, tabs: 3 },
                { name: 'Manchester', color: COLORS.cyan, tabs: 4 },
                { name: 'AZ Startup', color: COLORS.orange, tabs: 6 },
                { name: 'MAT 343', color: COLORS.yellow, tabs: 3 },
                { name: 'Dev', color: COLORS.blue, tabs: 7 },
            ].map(g => `
                <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;
                    background:rgba(255,255,255,0.03);">
                    <div style="width:8px;height:8px;border-radius:50%;background:${g.color};flex-shrink:0;"></div>
                    <span style="flex:1;font-size:11px;font-weight:500;">${g.name}</span>
                    <span style="font-size:10px;color:rgba(255,255,255,0.3);">${g.tabs}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </div>
            `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
            <button style="flex:1;padding:10px;border-radius:8px;background:#fff;color:#000;font-size:11px;
                font-weight:600;border:none;display:flex;align-items:center;justify-content:center;gap:6px;">
                &#8634; Restore All
            </button>
            <button style="padding:10px;border-radius:8px;background:rgba(239,68,68,0.1);border:none;
                color:#ef4444;font-size:12px;">&#128465;</button>
        </div>
    </div>`;

    return screenshotWrapper(
        'Save & Restore Workspaces',
        'Group of groups — save entire sessions, restore them anytime',
        popupFrame('SPACES', spacesBody),
        detailsPanel,
        'side'
    );
};

// ─── Screenshot 4: Group Permissions ────────────────────────────────

const screenshot4 = () => {
    const groupsBody = `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
            border-radius:14px;padding:24px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
                <h2 style="font-size:16px;font-weight:700;">Group Permissions</h2>
            </div>
            <p style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:20px;">
                Create custom groups and control how the AI can interact with them.
            </p>
            <!-- Input -->
            <div style="display:flex;gap:8px;margin-bottom:20px;">
                <div style="flex:1;padding:10px 14px;border-radius:8px;background:rgba(255,255,255,0.04);
                    border:1px solid rgba(255,255,255,0.08);font-size:12px;color:rgba(255,255,255,0.3);">
                    New Group Name (e.g., Reading List)
                </div>
                <button style="padding:10px 16px;border-radius:8px;background:#fff;color:#000;font-size:12px;
                    font-weight:600;border:none;">Add Group</button>
            </div>
            <!-- Columns -->
            <div style="display:flex;gap:12px;">
                ${[
                    {
                        title: 'Editable', subtitle: 'Add & Remove', color: '#22c55e',
                        items: ['Dev', 'Study', 'Entertainment', 'Communication', 'Markets', 'AI']
                    },
                    {
                        title: 'Add Only', subtitle: 'Append Only', color: '#eab308',
                        items: ['AZ Startup', 'MAT 343']
                    },
                    {
                        title: 'Locked', subtitle: 'No Changes', color: '#ef4444',
                        items: ['Italian', 'TUM', 'TUB', 'Edinburgh', 'UCL']
                    },
                ].map(col => `
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;
                            border-bottom:2px solid ${col.color};margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <div style="width:8px;height:8px;border-radius:50%;background:${col.color};"></div>
                                <span style="font-size:12px;font-weight:700;">${col.title}</span>
                            </div>
                            <span style="font-size:9px;color:rgba(255,255,255,0.3);">${col.subtitle}</span>
                        </div>
                        ${col.items.map(item => `
                            <div style="display:flex;align-items:center;justify-content:space-between;
                                padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.03);
                                border:1px solid rgba(255,255,255,0.05);margin-bottom:4px;">
                                <span style="font-size:11px;font-weight:500;">${item}</span>
                                <span style="color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;">&#10005;</span>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    return screenshotWrapper(
        'Smart Group Permissions',
        'Lock, append-only, or fully editable — control what AI can touch',
        optionsFrame('Groups', groupsBody),
    );
};

// ─── Screenshot 5: SOUL + Feedback ──────────────────────────────────

const screenshot5 = () => {
    const advancedBody = `
        <div style="display:flex;gap:20px;">
            <!-- SOUL editor -->
            <div style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
                border-radius:14px;padding:20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:16px;">&#120139;</span>
                        <h3 style="font-size:14px;font-weight:700;">SOUL.md Truth Source</h3>
                    </div>
                    <button style="padding:6px 14px;border-radius:6px;background:#fff;color:#000;font-size:10px;
                        font-weight:600;border:none;display:flex;align-items:center;gap:4px;">&#128190; Save</button>
                </div>
                <p style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:12px;">
                    The core system prompt and classification rules for the AI.
                </p>
                <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:16px;font-family:monospace;
                    font-size:10px;line-height:1.7;color:rgba(255,255,255,0.7);max-height:280px;overflow:hidden;">
                    <span style="color:rgba(255,255,255,0.4);"># IntelliTab SOUL (Truth Source)</span><br>
                    <span style="color:rgba(255,255,255,0.4);">_version: 2.0 &bull; explicit mode_</span><br><br>
                    You are IntelliTab, a tab librarian.<br>
                    Goal: clean, scan-friendly groups.<br><br>
                    <span style="color:rgba(255,255,255,0.4);">## Top Guidelines</span><br>
                    1) DO NOT invent categories.<br>
                    2) If tab matches a STRICT RULE or<br>
                    &nbsp;&nbsp;&nbsp;LEARNED PATTERN, follow it.<br>
                    3) Never put same tab in 2 groups.<br>
                    4) If 1-2 tabs don't fit, leave them.<br><br>
                    <span style="color:rgba(255,255,255,0.4);">## Naming Convention</span><br>
                    * Work (Jobs, docs, spreadsheets)<br>
                    * Study (Canvas, university portals)<br>
                    * Dev (GitHub, cloud consoles)<br>
                    * Communication (Email, WhatsApp)
                </div>
            </div>
            <!-- Feedback chat -->
            <div style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
                border-radius:14px;padding:20px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <h3 style="font-size:14px;font-weight:700;">AI Training Chat</h3>
                </div>
                <!-- Last action -->
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);
                    border-radius:10px;padding:12px;margin-bottom:14px;">
                    <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);letter-spacing:0.5px;">
                        LAST ACTION MEMORY
                    </span>
                    <p style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px;">Organized 35 tabs.</p>
                    <div style="margin-top:6px;padding:8px;border-radius:6px;background:rgba(0,0,0,0.2);font-size:10px;">
                        <strong>Dev (17)</strong> &middot; GitHub repos, Vercel, APIs<br>
                        <strong>Study (8)</strong> &middot; Canvas, university portals<br>
                        <strong>Communication (5)</strong> &middot; Gmail, WhatsApp<br>
                        <strong>Markets (4)</strong> &middot; TradingView, crypto<br>
                    </div>
                </div>
                <!-- Chat -->
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
                    <div style="align-self:flex-end;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.2);
                        padding:8px 12px;border-radius:10px 10px 2px 10px;font-size:10px;max-width:85%;">
                        YouTube should be in Entertainment, not Dev
                    </div>
                    <div style="align-self:flex-start;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);
                        padding:8px 12px;border-radius:10px 10px 10px 2px;font-size:10px;max-width:85%;
                        color:rgba(255,255,255,0.7);">
                        Got it! I've updated the pattern: youtube.com &rarr; Entertainment (+2.0 weight). I'll remember this for future grouping.
                    </div>
                </div>
                <div style="display:flex;gap:6px;">
                    <div style="flex:1;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.04);
                        border:1px solid rgba(255,255,255,0.06);font-size:10px;color:rgba(255,255,255,0.3);">
                        Explain common mistakes or new rules...
                    </div>
                    <button style="padding:8px 10px;border-radius:8px;background:#fff;color:#000;border:none;font-size:10px;">
                        &#10148;
                    </button>
                </div>
            </div>
        </div>
    `;

    return screenshotWrapper(
        'SOUL Editor & AI Training',
        'Edit the AI\'s personality, chat with it to teach new patterns',
        optionsFrame('Advanced', advancedBody),
    );
};

// ─── Video title/end frames ─────────────────────────────────────────

const titleFrame = () => `
<div style="position:relative; width:1280px; height:800px; display:flex; align-items:center; justify-content:center;">
    <div class="orb" style="width:600px;height:600px;background:radial-gradient(circle,${COLORS.accent},transparent);top:-150px;right:-100px;"></div>
    <div class="orb" style="width:500px;height:500px;background:radial-gradient(circle,${COLORS.pink},transparent);bottom:-100px;left:-80px;"></div>
    <div class="orb" style="width:400px;height:400px;background:radial-gradient(circle,${COLORS.cyan},transparent);top:30%;left:25%;"></div>
    <div style="text-align:center; z-index:1;">
        <div style="display:inline-flex;align-items:center;gap:14px;margin-bottom:20px;color:#a5b4fc;">
            ${sparkle(56)}
        </div>
        <h1 style="font-size:72px;font-weight:900;letter-spacing:-2px;line-height:1;">IntelliTab</h1>
        <p style="font-size:22px;color:rgba(255,255,255,0.5);margin-top:12px;font-weight:400;">
            AI-powered tab organizer & memory core
        </p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:28px;">
            <span style="padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;
                background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.25);">AI Grouping</span>
            <span style="padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;
                background:rgba(236,72,153,0.15);color:#f9a8d4;border:1px solid rgba(236,72,153,0.25);">Adaptive Learning</span>
            <span style="padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;
                background:rgba(6,182,212,0.15);color:#67e8f9;border:1px solid rgba(6,182,212,0.25);">Workspaces</span>
        </div>
    </div>
</div>`;

const endFrame = () => `
<div style="position:relative; width:1280px; height:800px; display:flex; align-items:center; justify-content:center;">
    <div class="orb" style="width:600px;height:600px;background:radial-gradient(circle,${COLORS.accent},transparent);top:-150px;left:-100px;"></div>
    <div class="orb" style="width:500px;height:500px;background:radial-gradient(circle,${COLORS.pink},transparent);bottom:-100px;right:-80px;"></div>
    <div style="text-align:center; z-index:1;">
        <div style="display:inline-flex;align-items:center;gap:12px;margin-bottom:16px;color:#a5b4fc;">
            ${sparkle(48)}
        </div>
        <h1 style="font-size:56px;font-weight:900;letter-spacing:-1.5px;">Get IntelliTab</h1>
        <p style="font-size:20px;color:rgba(255,255,255,0.45);margin-top:10px;">
            Available on Chrome Web Store
        </p>
        <div style="margin-top:30px;padding:14px 40px;border-radius:14px;background:#fff;color:#000;
            display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:700;">
            Install Free
        </div>
        <p style="font-size:13px;color:rgba(255,255,255,0.25);margin-top:16px;">
            Chrome &bull; Brave &bull; Edge &bull; Arc
        </p>
    </div>
</div>`;

// ─── Render engine ──────────────────────────────────────────────────

async function renderHTML(html, width, height, outputPath) {
    const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseCSS}</style></head>
    <body>${html}</body></html>`;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 600));
    const buf = await page.screenshot({ type: 'png', omitBackground: false });
    writeFileSync(outputPath, buf);
    await browser.close();
    return outputPath;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('🎨 Generating IntelliTab Chrome Web Store assets...\n');

    // Store screenshots (1280x800)
    const screenshots = [
        { name: 'screenshot-1-organize', gen: screenshot1 },
        { name: 'screenshot-2-learn', gen: screenshot2 },
        { name: 'screenshot-3-workspaces', gen: screenshot3 },
        { name: 'screenshot-4-permissions', gen: screenshot4 },
        { name: 'screenshot-5-soul-feedback', gen: screenshot5 },
    ];

    for (const s of screenshots) {
        const path = join(ASSETS, `${s.name}.png`);
        await renderHTML(s.gen(), 1280, 800, path);
        console.log(`  ✓ ${s.name}.png`);
    }

    // Promo tiles
    // (keep existing small + marquee from previous generation)

    // Video frames (1280x800)
    const videoFrames = [
        { name: 'frame-00-title', gen: titleFrame },
        { name: 'frame-01-organize', gen: screenshot1 },
        { name: 'frame-02-learn', gen: screenshot2 },
        { name: 'frame-03-workspaces', gen: screenshot3 },
        { name: 'frame-04-permissions', gen: screenshot4 },
        { name: 'frame-05-soul', gen: screenshot5 },
        { name: 'frame-06-end', gen: endFrame },
    ];

    console.log('');
    for (const f of videoFrames) {
        const path = join(FRAMES, `${f.name}.png`);
        await renderHTML(f.gen(), 1280, 800, path);
        console.log(`  ✓ ${f.name}.png`);
    }

    console.log('\n✅ All assets generated!');
    console.log(`   Screenshots: ${ASSETS}/screenshot-*.png`);
    console.log(`   Video frames: ${FRAMES}/frame-*.png`);
    console.log('\n   Next: Run "node promo/generate-video.mjs" to create the promo video.');
}

main().catch(err => { console.error('❌', err); process.exit(1); });
