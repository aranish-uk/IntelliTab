/**
 * Scene 5: Recovery (17–20.5s)
 * "Even when the browser forgets." — persistence/recovery
 * Fixed: removed bright flash glitch (was setting bg to white on crash frame)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GlowOrb } from '../components/GlowOrb';
import { StaggeredText, AnimatedText } from '../components/AnimatedText';
import { COLORS } from '../styles/theme';

export const RecoveryScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
    const fadeOut = interpolate(frame, [85, 105], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Subtle screen flicker instead of harsh flash
    const crashFrame = 25;
    const flickerIntensity = (() => {
        const dist = Math.abs(frame - crashFrame);
        if (dist > 4) return 0;
        // Smooth flicker that fades — not a harsh white flash
        return interpolate(dist, [0, 4], [0.06, 0], { extrapolateRight: 'clamp' });
    })();

    // Recovery banner slides in after the "crash"
    const bannerProgress = spring({ frame: frame - 45, fps, config: { damping: 16, mass: 0.7 } });
    const bannerY = interpolate(bannerProgress, [0, 1], [-80, 0]);
    const bannerOpacity = interpolate(bannerProgress, [0, 1], [0, 1]);
    const bannerScale = interpolate(bannerProgress, [0, 1], [0.95, 1]);

    // Restore button pulse
    const pulse = Math.sin(frame * 0.15) * 0.03 + 1;
    const btnGlow = interpolate(Math.sin(frame * 0.12), [-1, 1], [0.1, 0.25]);

    // "Restoring..." progress bar after banner appears
    const restoreProgress = interpolate(frame, [65, 90], [0, 100], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const restoreBarOp = interpolate(frame, [62, 68], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    return (
        <div style={{
            width, height, background: COLORS.bg,
            position: 'relative', overflow: 'hidden',
            opacity: fadeIn * fadeOut,
        }}>
            {/* Subtle red-tinted flicker overlay instead of white flash */}
            {flickerIntensity > 0 && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 20,
                    background: `rgba(239,68,68,${flickerIntensity})`,
                    pointerEvents: 'none',
                }} />
            )}

            <GlowOrb color={COLORS.orange} size={400} x={width / 2 - 200} y={-100} drift={15} />
            <GlowOrb color={COLORS.red} size={300} x={-50} y={height - 150} drift={20} />
            <GlowOrb color={COLORS.green} size={350} x={width - 200} y={height / 2} drift={12} />

            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 28,
            }}>
                {/* "Browser forgets" text */}
                <StaggeredText
                    text="Even when the browser forgets."
                    fontSize={48}
                    startDelay={5}
                    stagger={3}
                    weight={800}
                />

                {/* Recovery banner mockup */}
                <div style={{
                    transform: `translateY(${bannerY}px) scale(${bannerScale})`,
                    opacity: bannerOpacity,
                    padding: '22px 36px',
                    borderRadius: 18,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    display: 'flex', alignItems: 'center', gap: 20,
                    maxWidth: 580,
                    fontFamily: "'Inter', sans-serif",
                    boxShadow: '0 16px 50px rgba(0,0,0,0.35), 0 0 30px rgba(34,197,94,0.08)',
                }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: 'rgba(34,197,94,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, flexShrink: 0,
                    }}>
                        🔄
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green }}>
                            Groups lost after restart?
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                            IntelliTab has a snapshot of your last session.
                        </div>
                        {/* Restore progress bar */}
                        {restoreBarOp > 0 && (
                            <div style={{
                                marginTop: 10, width: '100%', height: 4, borderRadius: 2,
                                background: 'rgba(255,255,255,0.06)',
                                opacity: restoreBarOp,
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${restoreProgress}%`, height: '100%',
                                    borderRadius: 2,
                                    background: `linear-gradient(90deg, ${COLORS.green}80, ${COLORS.green})`,
                                    boxShadow: `0 0 8px ${COLORS.green}40`,
                                }} />
                            </div>
                        )}
                    </div>
                    <div style={{
                        padding: '10px 22px', borderRadius: 10,
                        background: '#fff', color: '#000',
                        fontSize: 13, fontWeight: 700,
                        transform: `scale(${pulse})`,
                        flexShrink: 0,
                        boxShadow: `0 4px 20px rgba(255,255,255,${btnGlow})`,
                    }}>
                        {restoreProgress >= 100 ? '✓ Restored' : 'Restore'}
                    </div>
                </div>

                <AnimatedText
                    text="IntelliTab remembers. Always."
                    fontSize={18}
                    color="rgba(255,255,255,0.4)"
                    delay={60}
                    weight={500}
                />
            </div>
        </div>
    );
};
