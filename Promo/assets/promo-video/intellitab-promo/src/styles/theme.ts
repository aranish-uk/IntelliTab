/** Design tokens for IntelliTab promo video */

export const COLORS = {
    bg: '#0a0a0a',
    bgAlt: '#111111',
    card: '#141414',
    cardBorder: 'rgba(255,255,255,0.06)',
    text: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.55)',
    textMuted: 'rgba(255,255,255,0.3)',
    accent: '#6366f1',
    accentGlow: 'rgba(99,102,241,0.4)',
    pink: '#ec4899',
    pinkGlow: 'rgba(236,72,153,0.4)',
    cyan: '#06b6d4',
    cyanGlow: 'rgba(6,182,212,0.4)',
    green: '#22c55e',
    yellow: '#eab308',
    orange: '#f97316',
    red: '#ef4444',
    blue: '#3b82f6',
    purple: '#a855f7',
} as const;

export const TAB_GROUP_COLORS = {
    Dev: COLORS.blue,
    Study: COLORS.yellow,
    Communication: COLORS.green,
    Markets: COLORS.orange,
    AI: COLORS.purple,
    Entertainment: COLORS.red,
    Italian: COLORS.blue,
    TUM: COLORS.red,
    Edinburgh: COLORS.green,
    UCL: COLORS.pink,
    Glasgow: COLORS.purple,
    Manchester: COLORS.cyan,
} as const;

/** Timing map (in frames at 30fps) */
export const TIMING = {
    fps: 30,
    totalDuration: 25, // seconds
    scenes: {
        hook:      { start: 0,   duration: 4   }, // 0-4s: chaotic tabs
        organize:  { start: 4,   duration: 4.5 }, // 4-8.5s: AI organize
        learn:     { start: 8.5, duration: 4.5 }, // 8.5-13s: learning
        spaces:    { start: 13,  duration: 4   }, // 13-17s: workspaces
        recovery:  { start: 17,  duration: 3.5 }, // 17-20.5s: persistence
        hero:      { start: 20.5,duration: 4.5 }, // 20.5-25s: finale
    },
} as const;

export const sceneFrames = (scene: keyof typeof TIMING.scenes) => ({
    from: Math.round(TIMING.scenes[scene].start * TIMING.fps),
    durationInFrames: Math.round(TIMING.scenes[scene].duration * TIMING.fps),
});
