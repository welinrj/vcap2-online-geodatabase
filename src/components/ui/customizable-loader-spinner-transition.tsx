'use client';
import React, { useEffect, useMemo } from 'react';

interface PortalLoaderProps {
  /** Number of nested squares */
  squareCount?: number;
  /** Animation speed multiplier */
  speed?: number;
  /** Whether the loader fills the full viewport or fits inline */
  fullScreen?: boolean;
}

export const PortalLoader: React.FC<PortalLoaderProps> = ({
  squareCount = 10,
  speed = 0.5,
  fullScreen = false,
}) => {
  useEffect(() => {
    const styleId = 'nested-squares-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes nestedSquareMagic {
          0% {
            transform: scale(0) rotate(0deg);
            filter: blur(0px);
          }
          50% {
            transform: scale(1) rotate(90deg);
            filter: blur(0.5px);
          }
          100% {
            transform: scale(2) rotate(180deg);
            filter: blur(1px);
          }
        }
        @keyframes nestedSquareGlow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
        }
        .nested-square {
          animation: nestedSquareMagic calc(2s / var(--speed, 1)) ease infinite alternate;
          animation-delay: var(--delay);
          animation-play-state: running;
          transform-origin: center;
          will-change: transform;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      const style = document.getElementById(styleId);
      if (style && document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  const squares = useMemo(() => {
    return Array.from({ length: squareCount }, (_, i) => {
      const index = i + 1;
      const hue = (index * 360) / squareCount;
      return {
        id: index,
        padding: index * 8,
        offset: index * -8,
        color: `hsl(${160 + hue / 2.5}, 55%, 55%)`,
        delay: i * 0.08,
      };
    });
  }, [squareCount]);

  const containerStyle: React.CSSProperties = fullScreen
    ? {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(241, 245, 249, 0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '2rem',
      };

  return (
    <div style={containerStyle}>
      {/* Subtle background particles (only in fullscreen mode) */}
      {fullScreen && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {[...Array(10)].map((_, i) => (
            <div
              key={`bg-${i}`}
              style={{
                position: 'absolute',
                width: '3px',
                height: '3px',
                backgroundColor: '#22c55e',
                borderRadius: '50%',
                left: `${10 + (i * 73) % 80}%`,
                top: `${5 + (i * 47) % 90}%`,
                animation: `nestedSquareGlow ${3 + (i % 4)}s ease-in-out infinite`,
                animationDelay: `${(i * 0.4) % 3}s`,
                opacity: 0.3,
              }}
            />
          ))}
        </div>
      )}

      {/* Main animation */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          {squares.map((square) => (
            <div
              key={square.id}
              className="nested-square"
              style={{
                position: 'absolute',
                boxSizing: 'content-box',
                padding: `${square.padding}px`,
                top: `${square.offset}px`,
                left: `${square.offset}px`,
                border: `1px solid ${square.color}`,
                boxShadow: `0 0 3px ${square.color}`,
                borderRadius: '2px',
                '--delay': `${square.delay}s`,
                '--speed': speed,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {/* Loading text */}
      <div
        style={{
          marginTop: `${squareCount * 8 + 40}px`,
          color: '#64748b',
          fontSize: '0.8rem',
          fontWeight: 500,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          fontFamily: 'inherit',
        }}
      >
        Loading...
      </div>
    </div>
  );
};
