/**
 * Scene 3: Learn (8.5–13s)
 * "Then teach it your style." — learning visualization
 * Fixed: removed CSS transitions (don't work in Remotion), proper bar animation
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GlowOrb } from '../components/GlowOrb';
import { AnimatedText, StaggeredText } from '../components/AnimatedText';
import { COLORS } from '../styles/theme';

const CONFIDENCE_BARS = [
    { label: 'Passive', desc: 'Every 3 hours', width: 30, color: COLORS.cyan },
    { label: 'Manual', desc: 'Real-time listener', width: 55, color: COLORS.yellow },
    { label: 'Corrections', desc: 'You fix, AI learns', width: 85, color: COLORS.pink },
    { label: '"I like this"', desc: 'Explicit approval', width: 95, color: COLORS.green },
];

export const LearnScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
    const fadeOut = interpolate(frame, [115, 135], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    return (
        <div style={{
            width, height, background: COLORS.bg,
            position: 'relative', overflow: 'hidden',
            opacity: fadeIn * fadeOut,
        }}>
            <GlowOrb color={COLORS.pink} size={450} x={width - 300} y={-100} drift={25} />
            <GlowOrb color={COLORS.green} size={350} x={-50} y={height - 250} drift={20} />

            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 80,
            }}>
                {/* Left: text */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
                    <StaggeredText
                        text="Then teach it your style."
                        fontSize={48}
                        startDelay={10}
                        stagger={3}
                        weight={800}
                        style={{ justifyContent: 'flex-start' }}
                    />
                    <AnimatedText
                        text="IntelliTab learns from every correction, every group rename, every manual move."
                        fontSize={16}
                        color="rgba(255,255,255,0.45)"
                        delay={30}
                        weight={400}
                        style={{ lineHeight: 1.6, maxWidth: 380 }}
                    />

                    {/* Thumbs up button mockup */}
                    {(() => {
                        const btnProgress = spring({ frame: frame - 55, fps, config: { damping: 15 } });
                        const btnScale = interpolate(btnProgress, [0, 1], [0.8, 1]);
                        const btnOpacity = interpolate(btnProgress, [0, 1], [0, 1]);

                        // Button glow pulse
                        const glowPulse = interpolate(
                            Math.sin(frame * 0.12), [-1, 1], [0.08, 0.2]
                        );

                        return (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '14px 28px', borderRadius: 14,
                                background: '#ffffff', color: '#000000',
                                fontSize: 15, fontWeight: 700,
                                fontFamily: "'Inter', sans-serif",
                                transform: `scale(${btnScale})`, opacity: btnOpacity,
                                width: 'fit-content',
                                boxShadow: `0 8px 40px rgba(255,255,255,${glowPulse})`,
                            }}>
                                👍 This is how I like my tabs
                            </div>
                        );
                    })()}
                </div>

                {/* Right: confidence visualization */}
                {(() => {
                    const cardProgress = spring({ frame: frame - 35, fps, config: { damping: 20 } });
                    const cardOp = interpolate(cardProgress, [0, 1], [0, 1]);
                    const cardScale = interpolate(cardProgress, [0, 1], [0.9, 1]);

                    return (
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: 20,
                            padding: '28px 32px', borderRadius: 20,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            width: 400,
                            opacity: cardOp,
                            transform: `scale(${cardScale})`,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        }}>
                            <div style={{
                                fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
                                letterSpacing: 1.5, fontFamily: "'Inter', sans-serif",
                                textTransform: 'uppercase',
                            }}>
                                Learning Confidence
                            </div>

                            {CONFIDENCE_BARS.map((bar, i) => {
                                const barDelay = 42 + i * 10;
                                const barProgress = spring({
                                    frame: frame - barDelay,
                                    fps,
                                    config: { damping: 25, mass: 1.2, stiffness: 80 },
                                });
                                const barWidth = interpolate(barProgress, [0, 1], [0, bar.width]);
                                const labelOpacity = interpolate(barProgress, [0, 1], [0, 1]);

                                // Subtle glow on the bar end
                                const barGlow = interpolate(barProgress, [0.5, 1], [0, 1], {
                                    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                                });

                                return (
                                    <div key={bar.label} style={{ opacity: labelOpacity }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            marginBottom: 6,
                                            fontFamily: "'Inter', sans-serif",
                                        }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 600, color: '#fff',
                                            }}>
                                                {bar.label}
                                            </span>
                                            <span style={{
                                                fontSize: 11, color: 'rgba(255,255,255,0.3)',
                                            }}>
                                                {bar.desc}
                                            </span>
                                        </div>
                                        <div style={{
                                            width: '100%', height: 10, borderRadius: 5,
                                            background: 'rgba(255,255,255,0.05)',
                                            overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                width: `${barWidth}%`, height: '100%',
                                                borderRadius: 5,
                                                background: `linear-gradient(90deg, ${bar.color}90, ${bar.color})`,
                                                boxShadow: barGlow > 0
                                                    ? `0 0 ${12 * barGlow}px ${bar.color}60`
                                                    : 'none',
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};
