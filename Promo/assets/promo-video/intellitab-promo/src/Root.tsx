import { Composition, Series } from "remotion";
import { TIMING, sceneFrames } from "./styles/theme";
import { HookScene } from "./scenes/HookScene";
import { OrganizeScene } from "./scenes/OrganizeScene";
import { LearnScene } from "./scenes/LearnScene";
import { SpacesScene } from "./scenes/SpacesScene";
import { RecoveryScene } from "./scenes/RecoveryScene";
import { HeroScene } from "./scenes/HeroScene";

const FPS = TIMING.fps;
const TOTAL_FRAMES = TIMING.totalDuration * FPS;

const IntelliTabPromo: React.FC = () => {
    return (
        <Series>
            <Series.Sequence durationInFrames={sceneFrames('hook').durationInFrames}>
                <HookScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={sceneFrames('organize').durationInFrames}>
                <OrganizeScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={sceneFrames('learn').durationInFrames}>
                <LearnScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={sceneFrames('spaces').durationInFrames}>
                <SpacesScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={sceneFrames('recovery').durationInFrames}>
                <RecoveryScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={sceneFrames('hero').durationInFrames}>
                <HeroScene />
            </Series.Sequence>
        </Series>
    );
};

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="IntelliTabPromo"
                component={IntelliTabPromo}
                durationInFrames={TOTAL_FRAMES}
                fps={FPS}
                width={1920}
                height={1080}
            />
        </>
    );
};
