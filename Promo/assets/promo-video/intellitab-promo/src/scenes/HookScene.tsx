/**
 * Scene 1: Hook (0–4s)
 * Chaotic browser tabs spread evenly across the FULL screen
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GlowOrb } from '../components/GlowOrb';
import { StaggeredText } from '../components/AnimatedText';
import { COLORS } from '../styles/theme';

// Spread tabs across the FULL 1920x1080 canvas — edge to edge
const TAB_NAMES = [
    'GitHub - ragebaiter/proj...', 'Gmail - Inbox (47)', 'YouTube - How to center...',
    'ChatGPT - New chat', 'Hacker News', 'Amazon - Your Orders',
    'LinkedIn - Feed', 'Reddit - r/programming', 'Canvas LMS - Assignme...',
    'TradingView - BTC/USD', 'Vercel - Dashboard', 'MDN Web Docs - fetch',
    'Twitter / X - Home', 'Stack Overflow - Rea...', 'Google Docs - Thesis D...',
    'Notion - Sprint Plann...', 'Figma - App Redesign', 'Spotify - Web Player',
    'AWS Console - EC2', 'Discord - Server', 'WhatsApp Web',
    'Google Maps - Directi...', 'Jira - PROJ-1234', 'Medium - How to Build...',
    'Slack - #general', 'Docker Hub - Images', 'Netflix - Browse',
    'Wikipedia - Quantum...', 'Coursera - Machine L...', 'NPM - package search',
    'Google Calendar', 'Trello - Board View', 'PayPal - Activity',
    'Twitch - Following', 'Google Drive - My Dr...', 'Zoom - Meetings',
    'Pinterest - Home', 'Stripe - Dashboard', 'Instagram - Feed',
    'Claude - Chat', 'Apple Music - Listen', 'Yahoo Finance - Mark...',
    'Shopify - Admin', 'Bitbucket - Repos', 'Behance - Discover',
    'Grammarly - Editor', 'eBay - Watchlist', 'Codepen - Trending',
    'Duolingo - Practice', 'Uber Eats - Orders', 'Airbnb - Trips',
    'Canva - Design', 'Calendly - Schedule', 'Airtable - Base',
    'Miro - Board', 'Loom - Videos', 'Todoist - Tasks',
];

// Deterministic pseudo-random using index
const pseudoRand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

// 8 rows × 7 cols = 56 tabs filling edge to edge
const COLS = 7;
const ROWS = 8;
const CHAOTIC_TABS = TAB_NAMES.slice(0, COLS * ROWS).map((title, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // Fill the FULL canvas: 0→1920 horizontally, 0→1080 vertically
    // Using cell centers with margins of ~30px from edges
    const cellW = (1920 - 60) / COLS;
    const cellH = (1080 - 40) / ROWS;
    const baseX = 30 + col * cellW + cellW * 0.3;
    const baseY = 20 + row * cellH + cellH * 0.3;
    // Jitter to break the grid feel
    const jitterX = (pseudoRand(i * 3) - 0.5) * cellW * 0.5;
    const jitterY = (pseudoRand(i * 7) - 0.5) * cellH * 0.4;
    const rot = (pseudoRand(i * 11) - 0.5) * 26;

    return { title, x: baseX + jitterX, y: baseY + jitterY, rot };
});

export const HookScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    // Tabs flood in fast
    const tabsVisible = Math.min(CHAOTIC_TABS.length, Math.floor(frame * 1.5) + 1);

    // Shake intensity ramps up
    const shake = interpolate(frame, [0, 40, 80], [0, 4, 10], { extrapolateRight: 'clamp' });
    const shakeX = Math.sin(frame * 0.7) * shake + Math.sin(frame * 1.3) * shake * 0.3;
    const shakeY = Math.cos(frame * 0.9) * shake + Math.cos(frame * 1.7) * shake * 0.3;

    const textDelay = 45;

    const fadeOut = interpolate(frame, [100, 120], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Red warning tint
    const warnTint = interpolate(frame, [30, 80], [0, 0.04], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Counter
    const counterProgress = spring({ frame: frame - 10, fps, config: { damping: 20 } });
    const counterOp = interpolate(counterProgress, [0, 1], [0, 1]);

    return (
        <div style={{
            width, height, background: COLORS.bg,
            position: 'relative', overflow: 'hidden',
            opacity: fadeOut,
        }}>
            <div style={{
                position: 'absolute', inset: 0, zIndex: 0,
                background: `rgba(239,68,68,${warnTint})`,
                pointerEvents: 'none',
            }} />

            <GlowOrb color={COLORS.red} size={500} x={-150} y={-150} drift={30} />
            <GlowOrb color={COLORS.orange} size={400} x={width - 250} y={height - 250} drift={25} />
            <GlowOrb color={COLORS.red} size={300} x={width / 2} y={height / 2 - 200} drift={20} />

            {/* Tab counter */}
            <div style={{
                position: 'absolute', top: 30, right: 40,
                padding: '8px 18px', borderRadius: 12,
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14, fontWeight: 700,
                color: COLORS.red,
                opacity: counterOp,
                zIndex: 15,
            }}>
                {Math.min(tabsVisible, CHAOTIC_TABS.length)} tabs open
            </div>

            {/* Chaotic tab pills */}
            <div style={{
                transform: `translate(${shakeX}px, ${shakeY}px)`,
                position: 'absolute', inset: 0,
            }}>
                {CHAOTIC_TABS.slice(0, tabsVisible).map((tab, i) => {
                    const bobX = Math.sin((frame + i * 20) * 0.05) * 10;
                    const bobY = Math.cos((frame + i * 15) * 0.06) * 8;
                    const bobRot = Math.sin((frame + i * 10) * 0.04) * 4;
                    const enter = spring({ frame: frame - Math.floor(i / 1.5), fps, config: { damping: 12, mass: 0.4 } });
                    const scale = interpolate(enter, [0, 1], [0.2, 1]);
                    const opacity = interpolate(enter, [0, 1], [0, 0.85]);
                    const brightness = 0.03 + (i % 5) * 0.008;

                    return (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                left: tab.x + bobX,
                                top: tab.y + bobY,
                                transform: `rotate(${tab.rot + bobRot}deg) scale(${scale})`,
                                opacity,
                                padding: '7px 14px',
                                borderRadius: 8,
                                background: `rgba(255,255,255,${brightness})`,
                                border: '1px solid rgba(255,255,255,0.08)',
                                fontSize: 11,
                                fontWeight: 500,
                                color: 'rgba(255,255,255,0.6)',
                                fontFamily: "'Inter', sans-serif",
                                whiteSpace: 'nowrap',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                            }}
                        >
                            {tab.title}
                        </div>
                    );
                })}
            </div>

            {/* "Too many tabs?" */}
            <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                zIndex: 10,
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(30px)',
                    padding: '36px 70px',
                    borderRadius: 24,
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                }}>
                    <StaggeredText
                        text="Too many tabs?"
                        fontSize={60}
                        startDelay={textDelay}
                        stagger={3}
                        weight={900}
                    />
                </div>
            </div>
        </div>
    );
};
