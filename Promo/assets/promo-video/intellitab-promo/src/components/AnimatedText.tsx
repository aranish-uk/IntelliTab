import React from 'react';
import { interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';

interface AnimatedTextProps {
    text: string;
    fontSize?: number;
    color?: string;
    delay?: number;
    style?: React.CSSProperties;
    gradient?: boolean;
    weight?: number;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
    text, fontSize = 48, color = '#ffffff', delay = 0,
    style, gradient = false, weight = 800,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const adjustedFrame = frame - delay;

    const progress = spring({ frame: adjustedFrame, fps, config: { damping: 20, mass: 0.8 } });
    const y = interpolate(progress, [0, 1], [40, 0]);
    const opacity = interpolate(progress, [0, 1], [0, 1]);

    const textStyle: React.CSSProperties = {
        fontSize,
        fontWeight: weight,
        fontFamily: "'Inter', -apple-system, sans-serif",
        letterSpacing: fontSize > 40 ? -1.5 : -0.5,
        lineHeight: 1.1,
        color: gradient ? 'transparent' : color,
        ...(gradient ? {
            background: 'linear-gradient(135deg, #a5b4fc, #ec4899, #67e8f9)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
        } : {}),
        transform: `translateY(${y}px)`,
        opacity,
        ...style,
    };

    return <div style={textStyle}>{text}</div>;
};

/** Staggered word-by-word animation */
export const StaggeredText: React.FC<{
    text: string;
    fontSize?: number;
    color?: string;
    startDelay?: number;
    stagger?: number;
    weight?: number;
    style?: React.CSSProperties;
}> = ({ text, fontSize = 48, color = '#fff', startDelay = 0, stagger = 3, weight = 800, style }) => {
    const words = text.split(' ');
    return (
        <div style={{ display: 'flex', gap: fontSize * 0.22, flexWrap: 'wrap', justifyContent: 'center', ...style }}>
            {words.map((word, i) => (
                <AnimatedText
                    key={i}
                    text={word}
                    fontSize={fontSize}
                    color={color}
                    delay={startDelay + i * stagger}
                    weight={weight}
                />
            ))}
        </div>
    );
};
