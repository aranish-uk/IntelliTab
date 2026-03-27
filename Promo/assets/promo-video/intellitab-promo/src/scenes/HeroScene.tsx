/**
 * Scene 6: Hero / Finale (20.5–25s)
 * Clean logo + tagline + CTA — uses the real IntelliTab icon (stacked cards)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GlowOrb } from '../components/GlowOrb';
import { COLORS } from '../styles/theme';

// Orbiting particles around the logo
const ORBIT_PARTICLES = Array.from({ length: 16 }, (_, i) => ({
    angle: (i / 16) * Math.PI * 2,
    radius: 120 + (i % 3) * 15,
    size: 2.5 + (i % 4),
    speed: 0.015 + (i % 3) * 0.005,
    color: [COLORS.accent, COLORS.pink, COLORS.cyan, COLORS.green][i % 4],
}));

/** SVG recreation of the IntelliTab icon — stacked cards with list lines */
const IntelliTabIcon: React.FC<{ size: number }> = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none">
        {/* Back card */}
        <rect x="42" y="22" width="74" height="56" rx="9"
            fill="none" stroke="#06b6d4" strokeWidth="3" opacity="0.3" />
        {/* Middle card */}
        <rect x="29" y="36" width="74" height="56" rx="9"
            fill="none" stroke="#06b6d4" strokeWidth="3" opacity="0.5" />
        {/* Front card */}
        <rect x="16" y="50" width="74" height="56" rx="9"
            fill="rgba(15,23,42,0.8)" stroke="#06b6d4" strokeWidth="3.5" />
        {/* Tab on top */}
        <rect x="21" y="43" width="28" height="10" rx="4"
            fill="rgba(15,23,42,0.8)" stroke="#06b6d4" strokeWidth="2.5" opacity="0.8" />
        {/* List lines */}
        <circle cx="27" cy="66" r="2.3" fill="#22d3ee" />
        <line x1="33" y1="66" x2="69" y2="66" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        <circle cx="27" cy="79" r="2.3" fill="#22d3ee" />
        <line x1="33" y1="79" x2="78" y2="79" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        <circle cx="27" cy="92" r="2.3" fill="#22d3ee" />
        <line x1="33" y1="92" x2="58" y2="92" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </svg>
);

export const HeroScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

    // Logo entrance
    const logoProgress = spring({ frame: frame - 5, fps, config: { damping: 12, mass: 1 } });
    const logoScale = interpolate(logoProgress, [0, 1], [0.3, 1]);
    const logoOpacity = interpolate(logoProgress, [0, 1], [0, 1]);

    // Tagline
    const tagProgress = spring({ frame: frame - 28, fps, config: { damping: 18 } });
    const tagY = interpolate(tagProgress, [0, 1], [30, 0]);
    const tagOpacity = interpolate(tagProgress, [0, 1], [0, 1]);

    // Version badge
    const verProgress = spring({ frame: frame - 45, fps, config: { damping: 20 } });
    const verOpacity = interpolate(verProgress, [0, 1], [0, 1]);
    const verScale = interpolate(verProgress, [0, 1], [0.8, 1]);

    // CTA
    const ctaProgress = spring({ frame: frame - 60, fps, config: { damping: 16 } });
    const ctaOpacity = interpolate(ctaProgress, [0, 1], [0, 1]);
    const ctaY = interpolate(ctaProgress, [0, 1], [20, 0]);
    const ctaGlow = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.1, 0.25]);

    // Glow pulse on icon
    const glowPulse = Math.sin(frame * 0.08) * 0.15 + 0.85;

    return (
        <div style={{
            width, height, background: COLORS.bg,
            position: 'relative', overflow: 'hidden',
            opacity: fadeIn,
        }}>
            <GlowOrb color={COLORS.accent} size={700} x={width / 2 - 350} y={height / 2 - 350} drift={8} />
            <GlowOrb color={COLORS.cyan} size={500} x={width / 2 + 50} y={height / 2 + 50} drift={10} />
            <GlowOrb color={COLORS.pink} size={400} x={width / 2 - 450} y={height / 2 + 100} drift={6} />

            {/* Orbiting particles */}
            {ORBIT_PARTICLES.map((p, i) => {
                const orbitP = spring({ frame: frame - 10 - i, fps, config: { damping: 30 } });
                const angle = p.angle + frame * p.speed;
                const px = width / 2 + Math.cos(angle) * p.radius;
                const py = height / 2 - 60 + Math.sin(angle) * p.radius * 0.5;
                const particleOp = interpolate(orbitP, [0, 1], [0, 0.7]);

                return (
                    <div key={i} style={{
                        position: 'absolute',
                        left: px - p.size / 2,
                        top: py - p.size / 2,
                        width: p.size, height: p.size,
                        borderRadius: '50%',
                        background: p.color,
                        opacity: particleOp,
                        boxShadow: `0 0 ${p.size * 4}px ${p.color}50`,
                        pointerEvents: 'none',
                    }} />
                );
            })}

            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 20,
            }}>
                {/* Logo + brand name */}
                <div style={{
                    transform: `scale(${logoScale})`,
                    opacity: logoOpacity,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                }}>
                    {/* Icon container with glow */}
                    <div style={{
                        width: 100, height: 100, borderRadius: 28,
                        background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.9))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 0 ${60 * glowPulse}px rgba(6,182,212,${0.3 * glowPulse}), 0 20px 60px rgba(0,0,0,0.5)`,
                        border: '1px solid rgba(6,182,212,0.2)',
                    }}>
                        <IntelliTabIcon size={70} />
                    </div>

                    {/* Brand name */}
                    <div style={{
                        fontSize: 72, fontWeight: 900,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        letterSpacing: -3,
                        background: 'linear-gradient(135deg, #67e8f9, #06b6d4, #a5b4fc)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                    }}>
                        IntelliTab
                    </div>
                </div>

                {/* Tagline */}
                <div style={{
                    fontSize: 28, fontWeight: 500, color: 'rgba(255,255,255,0.7)',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    letterSpacing: -0.5,
                    transform: `translateY(${tagY}px)`,
                    opacity: tagOpacity,
                }}>
                    Your tabs, finally under control.
                </div>

                {/* Version badge */}
                <div style={{
                    padding: '8px 20px', borderRadius: 100,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 14, fontWeight: 600,
                    color: 'rgba(255,255,255,0.5)',
                    fontFamily: "'Inter', sans-serif",
                    transform: `scale(${verScale})`,
                    opacity: verOpacity,
                    letterSpacing: 1,
                }}>
                    v2.1.0
                </div>

                {/* CTA */}
                <div style={{
                    marginTop: 12,
                    padding: '16px 44px', borderRadius: 16,
                    background: '#fff', color: '#000',
                    fontSize: 18, fontWeight: 800,
                    fontFamily: "'Inter', sans-serif",
                    transform: `translateY(${ctaY}px)`,
                    opacity: ctaOpacity,
                    boxShadow: `0 10px 50px rgba(255,255,255,${ctaGlow})`,
                }}>
                    Available on Chrome Web Store
                </div>
            </div>
        </div>
    );
};
