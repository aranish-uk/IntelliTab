/**
 * Scene 4: Spaces / Workspaces (13–17s)
 * "Save your spaces." — groups visibly fly into a workspace card
 * Enhanced: trail effect on flying groups, smoother card reactions
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GlowOrb } from '../components/GlowOrb';
import { StaggeredText, AnimatedText } from '../components/AnimatedText';
import { COLORS } from '../styles/theme';

const WORKSPACE_GROUPS = [
    { name: 'Italian', color: COLORS.blue, tabs: 5, icon: '🇮🇹' },
    { name: 'TUM', color: COLORS.red, tabs: 4, icon: '🎓' },
    { name: 'TUB', color: COLORS.yellow, tabs: 3, icon: '🏛️' },
    { name: 'Edinburgh', color: COLORS.green, tabs: 4, icon: '🏴' },
    { name: 'UCL', color: COLORS.pink, tabs: 5, icon: '🎓' },
    { name: 'Glasgow', color: COLORS.purple, tabs: 3, icon: '🏴' },
    { name: 'Manchester', color: COLORS.cyan, tabs: 4, icon: '⚽' },
];

const GROUPS_X = -240;
const CARD_X = 220;
const GROUP_START_Y = -130;
const GROUP_GAP = 46;

export const SpacesScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
    const fadeOut = interpolate(frame, [100, 120], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const centerX = width / 2;
    const centerY = height / 2 + 30;

    const cardCenterX = centerX + CARD_X;
    const cardCenterY = centerY;

    // Count absorbed groups
    const absorbedCount = WORKSPACE_GROUPS.reduce((count, _, i) => {
        const flyStart = 52 + i * 5;
        return frame > flyStart + 12 ? count + 1 : count;
    }, 0);

    const isAbsorbing = WORKSPACE_GROUPS.some((_, i) => {
        const flyStart = 52 + i * 5;
        const flyEnd = flyStart + 15;
        return frame >= flyStart && frame <= flyEnd;
    });

    return (
        <div style={{
            width, height, background: COLORS.bg,
            position: 'relative', overflow: 'hidden',
            opacity: fadeIn * fadeOut,
        }}>
            <GlowOrb color={COLORS.cyan} size={400} x={width / 2 - 200} y={-80} drift={20} />
            <GlowOrb color={COLORS.accent} size={350} x={width - 250} y={height - 200} drift={15} />

            {/* Title */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                display: 'flex', justifyContent: 'center',
                paddingTop: height * 0.08,
                zIndex: 10,
            }}>
                <StaggeredText
                    text="Save your spaces."
                    fontSize={52}
                    startDelay={8}
                    stagger={4}
                    weight={800}
                />
            </div>

            {/* Connection line from groups to card */}
            {(() => {
                const lineP = spring({ frame: frame - 48, fps, config: { damping: 20 } });
                const lineOp = interpolate(lineP, [0, 1], [0, 0.15]);
                return (
                    <svg style={{
                        position: 'absolute', top: 0, left: 0,
                        width, height, pointerEvents: 'none', zIndex: 3,
                    }}>
                        <line
                            x1={centerX + GROUPS_X + 100}
                            y1={centerY}
                            x2={cardCenterX - 130}
                            y2={cardCenterY}
                            stroke={COLORS.accent}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            opacity={lineOp}
                        />
                        {/* Arrow head */}
                        <polygon
                            points={`${cardCenterX - 130},${cardCenterY - 6} ${cardCenterX - 118},${cardCenterY} ${cardCenterX - 130},${cardCenterY + 6}`}
                            fill={COLORS.accent}
                            opacity={lineOp}
                        />
                    </svg>
                );
            })()}

            {/* Groups — fly from left into the card */}
            {WORKSPACE_GROUPS.map((g, i) => {
                const enterDelay = 20 + i * 4;
                const enterP = spring({ frame: frame - enterDelay, fps, config: { damping: 14 } });
                const enterX = interpolate(enterP, [0, 1], [-350, 0]);
                const enterOp = interpolate(enterP, [0, 1], [0, 1]);

                const flyStart = 52 + i * 5;
                const flyP = spring({ frame: frame - flyStart, fps, config: { damping: 10, mass: 0.4 } });

                const startX = centerX + GROUPS_X;
                const startY = centerY + GROUP_START_Y + i * GROUP_GAP;

                const flyX = interpolate(flyP, [0, 1], [startX, cardCenterX]);
                const flyY = interpolate(flyP, [0, 1], [startY, cardCenterY]);
                const flyScale = interpolate(flyP, [0, 1], [1, 0]);
                const flyOp = interpolate(flyP, [0, 1], [1, 0]);

                const isFlyPhase = frame >= flyStart;
                const isGone = flyP > 0.95;

                if (isGone) return null;

                return (
                    <React.Fragment key={g.name}>
                        {/* Trail particles during flight */}
                        {isFlyPhase && flyP > 0.05 && flyP < 0.9 && (
                            <>
                                {[0.7, 0.5, 0.3].map((t, ti) => {
                                    const trailX = interpolate(flyP * t, [0, 1], [startX, cardCenterX]);
                                    const trailY = interpolate(flyP * t, [0, 1], [startY, cardCenterY]);
                                    return (
                                        <div key={ti} style={{
                                            position: 'absolute',
                                            left: trailX, top: trailY,
                                            width: 6, height: 6,
                                            borderRadius: '50%',
                                            background: g.color,
                                            opacity: 0.3 - ti * 0.08,
                                            transform: 'translate(-50%, -50%)',
                                            boxShadow: `0 0 6px ${g.color}40`,
                                            pointerEvents: 'none',
                                            zIndex: 4,
                                        }} />
                                    );
                                })}
                            </>
                        )}
                        <div style={{
                            position: 'absolute',
                            left: isFlyPhase ? flyX : startX + enterX,
                            top: isFlyPhase ? flyY : startY,
                            transform: `translate(-50%, -50%) scale(${isFlyPhase ? flyScale : 1})`,
                            opacity: isFlyPhase ? flyOp : enterOp,
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 18px', borderRadius: 10,
                            background: `${g.color}15`,
                            border: `1px solid ${g.color}30`,
                            fontFamily: "'Inter', sans-serif",
                            whiteSpace: 'nowrap',
                            zIndex: 5,
                            boxShadow: isFlyPhase
                                ? `0 0 20px ${g.color}30`
                                : `0 4px 15px ${g.color}10`,
                        }}>
                            <span style={{ fontSize: 13 }}>{g.icon}</span>
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: g.color,
                                boxShadow: `0 0 8px ${g.color}60`,
                            }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                                {g.name}
                            </span>
                            <span style={{
                                fontSize: 12, color: 'rgba(255,255,255,0.35)',
                                marginLeft: 6,
                            }}>
                                {g.tabs} tabs
                            </span>
                        </div>
                    </React.Fragment>
                );
            })}

            {/* Workspace card */}
            {(() => {
                const cardP = spring({ frame: frame - 45, fps, config: { damping: 18 } });
                const cardScale = interpolate(cardP, [0, 1], [0.7, 1]);
                const cardOp = interpolate(cardP, [0, 1], [0, 1]);

                const glowIntensity = interpolate(absorbedCount, [0, 7], [0, 1], { extrapolateRight: 'clamp' });
                const absorptionPulse = isAbsorbing
                    ? interpolate(Math.sin(frame * 0.5), [-1, 1], [1, 1.04])
                    : 1;

                const allAbsorbed = absorbedCount >= 7;
                const checkP = spring({ frame: frame - 90, fps, config: { damping: 14 } });
                const checkScale = interpolate(checkP, [0, 1], [0.5, 1]);
                const checkOp = interpolate(checkP, [0, 1], [0, 1]);

                const displayedTabs = Math.round(interpolate(absorbedCount, [0, 7], [0, 28], { extrapolateRight: 'clamp' }));

                return (
                    <div style={{
                        position: 'absolute',
                        left: cardCenterX,
                        top: cardCenterY,
                        transform: `translate(-50%, -50%) scale(${cardScale * absorptionPulse})`,
                        opacity: cardOp,
                        padding: '32px 40px',
                        borderRadius: 22,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid rgba(255,255,255,${0.08 + glowIntensity * 0.12})`,
                        textAlign: 'center',
                        fontFamily: "'Inter', sans-serif",
                        boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 ${30 + glowIntensity * 50}px rgba(99,102,241,${glowIntensity * 0.2})`,
                        minWidth: 270,
                        zIndex: 6,
                    }}>
                        <div style={{ fontSize: 34, marginBottom: 10 }}>📁</div>
                        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, color: '#fff' }}>
                            Masters
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                            {absorbedCount} group{absorbedCount !== 1 ? 's' : ''} · {displayedTabs} tabs
                        </div>

                        {/* Color dots */}
                        <div style={{
                            display: 'flex', justifyContent: 'center', gap: 6,
                            marginTop: 14, marginBottom: 14,
                        }}>
                            {WORKSPACE_GROUPS.map((g, i) => {
                                const dotVisible = i < absorbedCount;
                                const dotP = spring({
                                    frame: frame - (55 + i * 5),
                                    fps,
                                    config: { damping: 10 },
                                });
                                return (
                                    <div key={g.name} style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: dotVisible ? g.color : 'rgba(255,255,255,0.1)',
                                        transform: `scale(${dotVisible ? interpolate(dotP, [0, 1], [2.5, 1]) : 1})`,
                                        opacity: dotVisible ? 1 : 0.3,
                                        boxShadow: dotVisible ? `0 0 10px ${g.color}80` : 'none',
                                    }} />
                                );
                            })}
                        </div>

                        {/* Save button → checkmark */}
                        <div style={{
                            padding: '12px 28px', borderRadius: 12,
                            background: allAbsorbed ? '#22c55e' : '#fff',
                            color: allAbsorbed ? '#fff' : '#000',
                            fontSize: 14, fontWeight: 700,
                            display: 'inline-block',
                            transform: allAbsorbed ? `scale(${checkScale})` : 'scale(1)',
                            opacity: allAbsorbed ? checkOp : 1,
                            boxShadow: allAbsorbed
                                ? '0 4px 25px rgba(34,197,94,0.5)'
                                : '0 4px 20px rgba(255,255,255,0.1)',
                        }}>
                            {allAbsorbed ? '✓ Saved' : 'Save workspace'}
                        </div>
                    </div>
                );
            })()}

            {/* Subtitle */}
            <div style={{
                position: 'absolute', bottom: height * 0.08, left: 0, right: 0,
                display: 'flex', justifyContent: 'center',
            }}>
                <AnimatedText
                    text="Close everything. Restore anytime."
                    fontSize={18}
                    color="rgba(255,255,255,0.4)"
                    delay={85}
                    weight={500}
                />
            </div>
        </div>
    );
};
