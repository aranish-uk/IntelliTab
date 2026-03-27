import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface FeatureTagProps {
    label: string;
    color: string;
    delay?: number;
    style?: React.CSSProperties;
}

export const FeatureTag: React.FC<FeatureTagProps> = ({
    label, color, delay = 0, style,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const progress = spring({ frame: frame - delay, fps, config: { damping: 20, mass: 0.5 } });
    const scale = interpolate(progress, [0, 1], [0.6, 1]);
    const opacity = interpolate(progress, [0, 1], [0, 1]);

    return (
        <span style={{
            display: 'inline-block',
            padding: '6px 16px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: 0.3,
            background: `${color}20`,
            color,
            border: `1px solid ${color}35`,
            transform: `scale(${scale})`,
            opacity,
            ...style,
        }}>
            {label}
        </span>
    );
};
