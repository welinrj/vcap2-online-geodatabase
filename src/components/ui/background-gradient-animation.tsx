"use client";
import { cn, isSafariBrowser } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Animated gradient background from 21st.dev / Aceternity UI.
 * Renders colorful, slowly-moving gradient orbs with blend modes,
 * giving the portal a vibrant yet professional appearance.
 */
export const BackgroundGradientAnimation = ({
  gradientBackgroundStart = "rgb(15, 23, 42)",
  gradientBackgroundEnd = "rgb(8, 47, 73)",
  firstColor = "34, 197, 94",
  secondColor = "59, 130, 246",
  thirdColor = "6, 182, 212",
  fourthColor = "168, 85, 247",
  fifthColor = "245, 158, 11",
  pointerColor = "34, 197, 94",
  size = "80%",
  blendingValue = "hard-light",
  children,
  className,
  interactive = true,
  containerClassName,
}: {
  gradientBackgroundStart?: string;
  gradientBackgroundEnd?: string;
  firstColor?: string;
  secondColor?: string;
  thirdColor?: string;
  fourthColor?: string;
  fifthColor?: string;
  pointerColor?: string;
  size?: string;
  blendingValue?: string;
  children?: React.ReactNode;
  className?: string;
  interactive?: boolean;
  containerClassName?: string;
}) => {
  const interactiveRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isSafari] = useState(isSafariBrowser);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.setProperty("--gradient-background-start", gradientBackgroundStart);
    el.style.setProperty("--gradient-background-end", gradientBackgroundEnd);
    el.style.setProperty("--first-color", firstColor);
    el.style.setProperty("--second-color", secondColor);
    el.style.setProperty("--third-color", thirdColor);
    el.style.setProperty("--fourth-color", fourthColor);
    el.style.setProperty("--fifth-color", fifthColor);
    el.style.setProperty("--pointer-color", pointerColor);
    el.style.setProperty("--size", size);
    el.style.setProperty("--blending-value", blendingValue);
  }, [
    gradientBackgroundStart, gradientBackgroundEnd,
    firstColor, secondColor, thirdColor, fourthColor, fifthColor,
    pointerColor, size, blendingValue,
  ]);

  useEffect(() => {
    if (!interactive || !interactiveRef.current) return;

    let curX = 0;
    let curY = 0;
    let tgX = 0;
    let tgY = 0;
    let animId = 0;
    let lastFrame = 0;
    const FRAME_INTERVAL = 50; // ~20fps instead of 60fps — sufficient for a background effect

    function move(now: number) {
      animId = requestAnimationFrame(move);
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;
      curX += (tgX - curX) / 20;
      curY += (tgY - curY) / 20;
      if (interactiveRef.current) {
        interactiveRef.current.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`;
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Just store target coords — no getBoundingClientRect() per event
      tgX = event.clientX;
      tgY = event.clientY;
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    animId = requestAnimationFrame(move);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, [interactive]);

  // Apply CSS variables directly as inline style so they are present on the
  // very first render — before useEffect fires.  Without this, Safari renders
  // `linear-gradient(40deg, var(--undefined), var(--undefined))` as black and
  // `mix-blend-mode: var(--undefined)` defaults to a value that covers the UI.
  const cssVars = {
    "--gradient-background-start": gradientBackgroundStart,
    "--gradient-background-end": gradientBackgroundEnd,
    "--first-color": firstColor,
    "--second-color": secondColor,
    "--third-color": thirdColor,
    "--fourth-color": fourthColor,
    "--fifth-color": fifthColor,
    "--pointer-color": pointerColor,
    "--size": size,
    "--blending-value": blendingValue,
  } as React.CSSProperties

  return (
    <div
      ref={containerRef}
      style={cssVars}
      className={cn(
        "bga-container",
        containerClassName
      )}
    >
      <svg className="bga-svg-hidden">
        <defs>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div className={cn("bga-children", className)}>{children}</div>
      <div
        className={cn(
          "bga-gradients",
          isSafari ? "bga-safari-blur" : "bga-default-blur"
        )}
      >
        <div className="bga-orb bga-orb-first" />
        <div className="bga-orb bga-orb-second" />
        <div className="bga-orb bga-orb-third" />
        <div className="bga-orb bga-orb-fourth" />
        <div className="bga-orb bga-orb-fifth" />
        {interactive && (
          <div
            ref={interactiveRef}
            className="bga-orb bga-orb-interactive"
          />
        )}
      </div>
    </div>
  );
};
