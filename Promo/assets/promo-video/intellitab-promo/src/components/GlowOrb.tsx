import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface GlowOrbProps {
    color: string;
    size: number;
    x: number;
    y: number;
    drift?: number;
    delay?: number;
}

export const GlowOrb: React.FC<GlowOrbProps> = ({
    color, size, x, y, drift = 20, delay = 0,
}) => {
    const frame = useCurrentFrame();
    const t = (frame - delay) / 60;
    const dx = Math.sin(t * 0.8) * drift;
    const dy = Math.cos(t * 1.1) * drift * 0.6;
    const scale = interpolate(Math.sin(t * 0.5), [-1, 1], [0.9, 1.1]);

    return (
        <div
            style={{
                position: 'absolute',
                left: x + dx,
                top: y + dy,
                width: size,
                height: size,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${color}, transparent)`,
                filter: `blur(${size * 0.35}px)`,
                opacity: 0.3,
                transform: `scale(${scale})`,
                pointerEvents: 'none',
            }}
        />
    );
};
