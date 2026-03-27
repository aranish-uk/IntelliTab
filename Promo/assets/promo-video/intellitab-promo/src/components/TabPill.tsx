import React from 'react';
import { interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';

interface TabPillProps {
    title: string;
    color: string;
    delay?: number;
    x?: number;
    y?: number;
    /** If true, starts chaotic then settles into position */
    chaotic?: boolean;
    chaoticX?: number;
    chaoticY?: number;
    chaoticRotation?: number;
    width?: number;
}

export const TabPill: React.FC<TabPillProps> = ({
    title, color, delay = 0, x = 0, y = 0,
    chaotic = false, chaoticX = 0, chaoticY = 0, chaoticRotation = 0,
    width,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const adjustedFrame = frame - delay;

    const settle = spring({ frame: adjustedFrame, fps, config: { damping: 15, mass: 0.6 } });
    const opacity = interpolate(settle, [0, 1], [0, 1]);

    let currentX = x;
    let currentY = y;
    let rotation = 0;

    if (chaotic) {
        currentX = interpolate(settle, [0, 1], [chaoticX, x]);
        currentY = interpolate(settle, [0, 1], [chaoticY, y]);
        rotation = interpolate(settle, [0, 1], [chaoticRotation, 0]);
    }

    return (
        <div
            style={{
                position: 'absolute',
                left: currentX,
                top: currentY,
                transform: `rotate(${rotation}deg)`,
                opacity,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                background: `${color}18`,
                border: `1px solid ${color}30`,
                whiteSpace: 'nowrap',
                width: width || 'auto',
            }}
        >
            <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, flexShrink: 0,
            }} />
            <span style={{
                fontSize: 13, fontWeight: 600, color: '#ffffff',
                fontFamily: "'Inter', sans-serif",
            }}>
                {title}
            </span>
        </div>
    );
};

/** A group label with count badge */
export const GroupPill: React.FC<{
    name: string;
    count: number;
    color: string;
    delay?: number;
    style?: React.CSSProperties;
}> = ({ name, count, color, delay = 0, style }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const progress = spring({ frame: frame - delay, fps, config: { damping: 18 } });
    const scale = interpolate(progress, [0, 1], [0.7, 1]);
    const opacity = interpolate(progress, [0, 1], [0, 1]);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 10,
            background: `${color}15`, border: `1px solid ${color}25`,
            transform: `scale(${scale})`, opacity,
            ...style,
        }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
                {name}
            </span>
            <span style={{
                fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Inter', sans-serif",
            }}>
                {count}
            </span>
        </div>
    );
};
