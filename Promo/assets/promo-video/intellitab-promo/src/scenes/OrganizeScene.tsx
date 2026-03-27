/**
 * Scene 2: AI Organize (4–8.5s)
 * Tabs fly into organized groups. "Let AI organize the chaos."
 * Enhanced: more visual depth, sparkle particles, better group cards
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GlowOrb } from '../components/GlowOrb';
import { AnimatedText, StaggeredText } from '../components/AnimatedText';
import { FeatureTag } from '../components/FeatureTag';
import { COLORS } from '../styles/theme';

const GROUPS = [
    { name: 'Dev', count: 12, color: COLORS.blue, icon: '💻' },
    { name: 'Study', count: 8, color: COLORS.yellow, icon: '📚' },
    { name: 'Communication', count: 5, color: COLORS.green, icon: '💬' },
    { name: 'Markets', count: 4, color: COLORS.orange, icon: '📈' },
    { name: 'AI', count: 3, color: COLORS.purple, icon: '🤖' },
    { name: 'Entertainment', count: 2, color: COLORS.red, icon: '🎮' },
];

// Sparkle particle positions
const SPARKLES = Array.from({ length: 12 }, (_, i) => ({
    x: 200 + Math.sin(i * 2.1) * 700,
    y: 150 + Math.cos(i * 1.7) * 400,
    size: 2 + (i % 3) * 1.5,
    speed: 0.03 + (i % 4) * 0.01,
    delay: i * 3,
}));

export const OrganizeScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
    const fadeOut = interpolate(frame, [115, 135], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Sparkle icon animation
    const sparkleScale = spring({ frame: frame - 8, fps, config: { damping: 8, mass: 0.5 } });
    const sparkleRotate = interpolate(frame, [8, 45], [0, 360], { extrapolateRight: 'clamp' });
    const sparkleGlow = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.2, 0.5]);

    return (
        <div style={{
            width, height, background: COLORS.bg,
            position: 'relative', overflow: 'hidden',
            opacity: fadeIn * fadeOut,
        }}>
            <GlowOrb color={COLORS.accent} size={500} x={width / 2 - 250} y={-100} drift={20} />
            <GlowOrb color={COLORS.cyan} size={350} x={-80} y={height - 200} drift={15} />
            <GlowOrb color={COLORS.purple} size={300} x={width - 100} y={200} drift={18} />

            {/* Floating sparkle particles */}
            {SPARKLES.map((s, i) => {
                const sparkP = spring({ frame: frame - s.delay - 20, fps, config: { damping: 30 } });
                const sparkOp = interpolate(sparkP, [0, 1], [0, 0.6]);
                const floatY = Math.sin((frame + i * 20) * s.speed) * 15;
                return (
                    <div key={i} style={{
                        position: 'absolute',
                        left: s.x + Math.sin((frame + i * 30) * 0.02) * 20,
                        top: s.y + floatY,
                        width: s.size, height: s.size,
                        borderRadius: '50%',
                        background: i % 2 === 0 ? COLORS.accent : COLORS.cyan,
                        opacity: sparkOp,
                        boxShadow: `0 0 ${s.size * 3}px ${i % 2 === 0 ? COLORS.accent : COLORS.cyan}60`,
                        pointerEvents: 'none',
                    }} />
                );
            })}

            {/* Main content */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 28,
            }}>
                {/* Sparkle icon */}
                <div style={{
                    width: 72, height: 72, borderRadius: 20,
                    background: 'rgba(99,102,241,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transform: `scale(${sparkleScale}) rotate(${sparkleRotate}deg)`,
                    boxShadow: `0 0 ${30 * sparkleGlow}px rgba(99,102,241,${sparkleGlow})`,
                }}>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                    </svg>
                </div>

                {/* Text */}
                <StaggeredText
                    text="Let AI organize the chaos."
                    fontSize={52}
                    startDelay={15}
                    stagger={3}
                    weight={800}
                />

                {/* Groups appear — enhanced with icons and glow */}
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 12,
                    justifyContent: 'center', maxWidth: 750, marginTop: 8,
                }}>
                    {GROUPS.map((g, i) => {
                        const progress = spring({ frame: frame - (32 + i * 5), fps, config: { damping: 16 } });
                        const scale = interpolate(progress, [0, 1], [0.5, 1]);
                        const opacity = interpolate(progress, [0, 1], [0, 1]);
                        const y = interpolate(progress, [0, 1], [20, 0]);

                        return (
                            <div key={g.name} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 20px', borderRadius: 12,
                                background: `${g.color}12`,
                                border: `1px solid ${g.color}30`,
                                transform: `scale(${scale}) translateY(${y}px)`,
                                opacity,
                                boxShadow: `0 4px 20px ${g.color}10`,
                            }}>
                                <span style={{ fontSize: 14 }}>{g.icon}</span>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: g.color,
                                    boxShadow: `0 0 8px ${g.color}50`,
                                }} />
                                <span style={{
                                    fontSize: 15, fontWeight: 700, color: '#fff',
                                    fontFamily: "'Inter', sans-serif",
                                }}>
                                    {g.name}
                                </span>
                                <span style={{
                                    fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.35)',
                                    fontFamily: "'Inter', sans-serif",
                                    marginLeft: 4,
                                }}>
                                    {g.count} tabs
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Feature tags — AI providers */}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <FeatureTag label="Groq" color="#a5b4fc" delay={68} />
                    <FeatureTag label="OpenAI" color="#67e8f9" delay={73} />
                    <FeatureTag label="Gemini" color="#fde047" delay={78} />
                    <FeatureTag label="Claude" color="#f9a8d4" delay={83} />
                </div>

                <AnimatedText
                    text="Works with any AI provider"
                    fontSize={16}
                    color="rgba(255,255,255,0.35)"
                    delay={88}
                    weight={500}
                />
            </div>
        </div>
    );
};
