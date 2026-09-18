"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";
import {
  getHeroVisualState,
  HERO_ASSETS,
  HERO_TIMELINE,
} from "./hero-story";

type CinematicHeroProps = {
  onEnterProduct: () => void;
};

type PointerPosition = { x: number; y: number };

export function CinematicHero({ onEnterProduct }: CinematicHeroProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);
  const scrollTweenRef = useRef<gsap.core.Tween | null>(null);
  const playbackDirectionRef = useRef<-1 | 1 | null>(null);
  const desiredProgressRef = useRef(reduceMotion ? 1 : 0);
  const desiredVideoTimeRef = useRef(0);
  const lastSeekAtRef = useRef(0);
  const pointerRef = useRef<PointerPosition>({ x: 50, y: 54 });
  const pointerTargetRef = useRef<PointerPosition>({ x: 50, y: 54 });
  const pointerFrameRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const [mediaState, setMediaState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [isTransitioning, setIsTransitioning] = useState(false);

  const flushVideoSeek = () => {
    const video = videoRef.current;
    if (
      !video ||
      video.seeking ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    )
      return;

    const now = performance.now();
    if (now - lastSeekAtRef.current < 42) return;

    const target = Math.min(
      video.duration - 0.04,
      Math.max(0, desiredVideoTimeRef.current),
    );
    if (Math.abs(video.currentTime - target) > 0.055) {
      lastSeekAtRef.current = now;
      video.currentTime = target;
    }
  };

  const scheduleVideoSeek = () => {
    if (reduceMotion) return;
    flushVideoSeek();
  };

  const playHeroTo = (destination: 0 | 1) => {
    const trigger = scrollTriggerRef.current;
    if (!trigger || reduceMotion) return;

    const target = destination === 1 ? trigger.end : trigger.start;
    const distance = Math.abs(target - window.scrollY);
    const totalDistance = Math.max(1, trigger.end - trigger.start);
    if (distance < 2) return;
    const video = videoRef.current;
    const videoDuration =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : HERO_TIMELINE.playbackDurationSeconds;
    const duration = Math.max(
      0.55,
      (videoDuration / HERO_TIMELINE.playbackRate) * (distance / totalDistance),
    );

    scrollTweenRef.current?.kill();
    playbackDirectionRef.current = destination === 1 ? 1 : -1;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      video.pause();
      if (destination === 1) {
        video.playbackRate = HERO_TIMELINE.playbackRate;
        void video.play().catch(() => {
          video.playbackRate = HERO_TIMELINE.playbackRate;
        });
      } else {
        video.playbackRate = 1;
      }
    }
    const scrollPosition = { value: window.scrollY };
    scrollTweenRef.current = gsap.to(scrollPosition, {
      value: target,
      duration,
      ease: "none",
      overwrite: true,
      onUpdate: () => window.scrollTo(0, scrollPosition.value),
      onComplete: () => {
        const completedVideo = videoRef.current;
        if (
          completedVideo &&
          Number.isFinite(completedVideo.duration) &&
          completedVideo.duration > 0
        ) {
          completedVideo.pause();
          completedVideo.playbackRate = 1;
          desiredVideoTimeRef.current =
            destination === 1 ? completedVideo.duration : 0;
          lastSeekAtRef.current = 0;
          flushVideoSeek();
        }
        playbackDirectionRef.current = null;
        scrollTweenRef.current = null;
      },
    });
  };

  const applyProgress = (progress: number) => {
    const root = rootRef.current;
    if (!root) return;

    desiredProgressRef.current = progress;
    const state = getHeroVisualState(progress);
    root.dataset.stage =
      progress < 0.22 ? "intro" : progress > 0.9 ? "final" : "journey";
    root.style.setProperty("--hero-progress", progress.toFixed(4));
    root.style.setProperty("--hero-intro", state.intro.toFixed(4));
    root.style.setProperty("--hero-final-title", state.finalTitle.toFixed(4));
    root.style.setProperty("--hero-final-copy", state.finalCopy.toFixed(4));
    root.style.setProperty("--hero-final-cta", state.finalCta.toFixed(4));
    root.style.setProperty("--hero-shade", state.shade.toFixed(4));
    root.style.setProperty("--hero-spotlight", state.spotlight.toFixed(4));

    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    desiredVideoTimeRef.current = video.duration * desiredProgressRef.current;
    if (!(playbackDirectionRef.current === 1 && !video.paused)) {
      scheduleVideoSeek();
    }
  };

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger);
      if (reduceMotion || !rootRef.current || !viewportRef.current) {
        applyProgress(1);
        return;
      }

      applyProgress(0);
      const trigger = ScrollTrigger.create({
        trigger: rootRef.current,
        start: "top top",
        end: () => `+=${window.innerHeight * HERO_TIMELINE.scrollLengthInViewports}`,
        pin: viewportRef.current,
        pinSpacing: true,
        scrub: 0.12,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (trigger) => applyProgress(trigger.progress),
      });
      scrollTriggerRef.current = trigger;

      const handleWheel = (event: WheelEvent) => {
        if (event.ctrlKey || Math.abs(event.deltaY) < 3) return;
        const direction = event.deltaY > 0 ? 1 : -1;
        const currentScroll = window.scrollY;
        const isInsideHero =
          currentScroll >= trigger.start - 2 && currentScroll <= trigger.end + 2;
        if (!isInsideHero) return;

        event.preventDefault();
        if (
          scrollTweenRef.current?.isActive() &&
          playbackDirectionRef.current === direction
        )
          return;
        playHeroTo(direction === 1 ? 1 : 0);
      };

      window.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        window.removeEventListener("wheel", handleWheel);
        scrollTweenRef.current?.kill();
        scrollTweenRef.current = null;
        scrollTriggerRef.current = null;
      };
    },
    { scope: rootRef, dependencies: [reduceMotion] },
  );

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== null)
        window.cancelAnimationFrame(pointerFrameRef.current);
      if (transitionTimerRef.current !== null)
        window.clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA)
      handleMediaReady();
  }, [reduceMotion]);

  const followPointer = () => {
    const root = rootRef.current;
    if (!root) return;
    const current = pointerRef.current;
    const target = pointerTargetRef.current;
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;
    root.style.setProperty("--hero-spotlight-x", `${current.x}%`);
    root.style.setProperty("--hero-spotlight-y", `${current.y}%`);

    if (Math.abs(current.x - target.x) + Math.abs(current.y - target.y) > 0.06) {
      pointerFrameRef.current = window.requestAnimationFrame(followPointer);
    } else {
      pointerFrameRef.current = null;
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || event.pointerType !== "mouse" || !rootRef.current) return;
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) return;
    rootRef.current.style.setProperty("--hero-pointer-active", "1");
    pointerTargetRef.current = {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
    if (pointerFrameRef.current === null)
      pointerFrameRef.current = window.requestAnimationFrame(followPointer);
  };

  const handlePointerLeave = () => {
    rootRef.current?.style.setProperty("--hero-pointer-active", "0");
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY;
    touchStartYRef.current = null;
    if (startY === null || endY === undefined || Math.abs(startY - endY) < 32)
      return;
    playHeroTo(startY > endY ? 1 : 0);
  };

  const handleMediaReady = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (reduceMotion && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, video.duration - 0.04);
    } else {
      desiredVideoTimeRef.current = video.duration * desiredProgressRef.current;
      applyProgress(desiredProgressRef.current);
    }
    setMediaState("ready");
  };

  const revealNextBeat = () => {
    playHeroTo(1);
  };

  const enterProduct = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (isTransitioning) return;
    if (reduceMotion) {
      onEnterProduct();
      return;
    }

    const root = rootRef.current;
    if (root && event) {
      const bounds = root.getBoundingClientRect();
      root.style.setProperty("--hero-portal-x", `${event.clientX - bounds.left}px`);
      root.style.setProperty("--hero-portal-y", `${event.clientY - bounds.top}px`);
    }
    setIsTransitioning(true);
    transitionTimerRef.current = window.setTimeout(onEnterProduct, 350);
  };

  return (
    <section
      className={`atlasHero ${reduceMotion ? "isReduced" : ""} ${isTransitioning ? "isTransitioning" : ""}`}
      ref={rootRef}
      data-media={mediaState}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="atlasHeroViewport" ref={viewportRef}>
        <HeroMedia
          videoRef={videoRef}
          mediaState={mediaState}
          onReady={handleMediaReady}
          onSeeked={scheduleVideoSeek}
          onError={() => setMediaState("failed")}
        />
        <div className="atlasHeroShade" aria-hidden="true" />
        <HeroSpotlight />
        <HeroNavigation onEnterProduct={enterProduct} />
        <IntroContent onContinue={revealNextBeat} />
        <FinalContent onEnterProduct={enterProduct} />
        <div className="atlasHeroPortal" aria-hidden="true" />
      </div>
    </section>
  );
}

function HeroMedia({
  videoRef,
  mediaState,
  onReady,
  onSeeked,
  onError,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaState: "loading" | "ready" | "failed";
  onReady: () => void;
  onSeeked: () => void;
  onError: () => void;
}) {
  return (
    <div className="atlasHeroMedia" aria-hidden="true">
      <picture className="atlasHeroPoster atlasHeroInitialPoster">
        <source
          media="(max-width: 700px) and (orientation: portrait)"
          srcSet={HERO_ASSETS.mobile.poster}
        />
        <img
          src={HERO_ASSETS.desktop.poster}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <picture className="atlasHeroPoster atlasHeroFinalPoster">
        <source
          media="(max-width: 700px) and (orientation: portrait)"
          srcSet={HERO_ASSETS.mobile.finalPoster}
        />
        <img src={HERO_ASSETS.desktop.finalPoster} alt="" decoding="async" />
      </picture>
      <video
        ref={videoRef}
        preload="auto"
        muted
        playsInline
        disablePictureInPicture
        data-loaded={mediaState === "ready"}
        onLoadedMetadata={onReady}
        onSeeked={onSeeked}
        onError={onError}
      >
        <source
          media="(max-width: 700px) and (orientation: portrait)"
          src={HERO_ASSETS.mobile.video}
          type="video/mp4"
        />
        <source src={HERO_ASSETS.desktop.video} type="video/mp4" />
      </video>
    </div>
  );
}

function HeroSpotlight() {
  return <div className="atlasHeroSpotlight" aria-hidden="true" />;
}

function HeroNavigation({ onEnterProduct }: { onEnterProduct: () => void }) {
  return (
    <header className="atlasHeroNav">
      <span className="brand" aria-label="Admitly">
        <i />
        Admitly
      </span>
      <button className="atlasHeroSkip" onClick={onEnterProduct}>
        К подбору
      </button>
    </header>
  );
}

function IntroContent({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="atlasHeroIntro">
      <h1>
        Твоё будущее начинается
        <br />
        с правильного выбора
      </h1>
      <button className="atlasHeroHint" onClick={onContinue}>
        <span>Прокрути, чтобы открыть путь</span>
        <span className="atlasHeroHintArrow" aria-hidden="true" />
      </button>
    </div>
  );
}

function FinalContent({
  onEnterProduct,
}: {
  onEnterProduct: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="atlasHeroFinal">
      <h2>
        Найди университет своей
        <br />
        <span>МЕЧТЫ</span>
      </h2>
      <p>Подбор университетов по твоим результатам, возможностям и целям</p>
      <button className="primary interactiveButton atlasHeroCta" onClick={onEnterProduct}>
        <span className="interactiveRest">Начать подбор</span>
        <span className="interactiveHover" aria-hidden="true">
          Начать подбор
        </span>
        <span className="interactiveFill" aria-hidden="true" />
      </button>
    </div>
  );
}
