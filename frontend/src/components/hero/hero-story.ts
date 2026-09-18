export const HERO_ASSETS = {
  desktop: {
    video: "/hero-assets/atlas-campus-desktop-smooth.mp4",
    poster: "/hero-assets/atlas-hero-poster00001.png",
    finalPoster: "/hero-assets/atlas-hero-poster.png",
  },
  mobile: {
    video: "/hero-assets/atlas-campus-mobile-smooth.mp4",
    poster: "/hero-assets/atlas-mobile-poster-initial.png",
    finalPoster: "/hero-assets/atlas-mobile-poster-final.png",
  },
} as const;

export const HERO_PRODUCT_ROUTE = "/onboarding";

export const HERO_TIMELINE = {
  scrollLengthInViewports: 2.75,
  playbackDurationSeconds: 2.7,
  playbackRate: 1.8,
  introExit: [0.12, 0.2],
  finalTitle: [0.88, 0.94],
  finalCopy: [0.94, 0.97],
  finalCta: [0.97, 1],
  lighting: [0.12, 0.2],
} as const;

export type HeroVisualState = {
  intro: number;
  finalTitle: number;
  finalCopy: number;
  finalCta: number;
  shade: number;
  spotlight: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const progressBetween = (progress: number, range: readonly [number, number]) =>
  clamp((progress - range[0]) / (range[1] - range[0]));

const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;

export function getHeroVisualState(progress: number): HeroVisualState {
  const introExit = easeOut(progressBetween(progress, HERO_TIMELINE.introExit));

  return {
    intro: 1 - introExit,
    finalTitle: easeOut(progressBetween(progress, HERO_TIMELINE.finalTitle)),
    finalCopy: easeOut(progressBetween(progress, HERO_TIMELINE.finalCopy)),
    finalCta: easeOut(progressBetween(progress, HERO_TIMELINE.finalCta)),
    shade: 1,
    spotlight: 1 - easeOut(progressBetween(progress, HERO_TIMELINE.lighting)),
  };
}
