'use client';
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { MediaGridItem } from "@/components/StickySections/StickySections";

interface CursorScrubGalleryProps {
    items: MediaGridItem[];
}

// Cursor distance (px) required to advance one item. Lower = more sensitive.
const DISTANCE_PER_ITEM = 55;
// Caps how many items a single huge jump (e.g. window blur/refocus) can skip.
const MAX_STEPS_PER_MOVE = 8;
// How many neighbors on each side of the active item stay mounted, for smooth crossfades.
const RENDER_WINDOW = 2;

const circularDistance = (a: number, b: number, len: number) => {
    const diff = Math.abs(a - b);
    return Math.min(diff, len - diff);
};

const CursorScrubGallery = ({ items }: CursorScrubGalleryProps) => {
    const [index, setIndex] = useState(0);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const accumulatedRef = useRef(0);
    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

    const advance = useCallback((steps: number) => {
        if (steps === 0) return;
        setIndex((prev) => {
            const len = items.length;
            return ((prev + steps) % len + len) % len;
        });
    }, [items.length]);

    useEffect(() => {
        if (items.length === 0) return;

        const handleMove = (clientX: number, clientY: number) => {
            const last = lastPosRef.current;
            lastPosRef.current = { x: clientX, y: clientY };
            if (!last) return;

            const dx = clientX - last.x;
            const dy = clientY - last.y;
            accumulatedRef.current += Math.sqrt(dx * dx + dy * dy);

            let steps = Math.floor(accumulatedRef.current / DISTANCE_PER_ITEM);
            if (steps === 0) return;

            steps = Math.min(steps, MAX_STEPS_PER_MOVE);
            accumulatedRef.current -= steps * DISTANCE_PER_ITEM;
            advance(steps);
        };

        const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
        const onTouchMove = (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch) handleMove(touch.clientX, touch.clientY);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("touchmove", onTouchMove, { passive: true });

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("touchmove", onTouchMove);
        };
    }, [items.length, advance]);

    // Only the active video plays; everything else stays paused.
    useEffect(() => {
        videoRefs.current.forEach((video, i) => {
            if (i === index) {
                video.currentTime = 0;
                video.play().catch(() => { });
            } else {
                video.pause();
            }
        });
    }, [index]);

    if (items.length === 0) return null;

    return (
        <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none">
            {items.map((item, i) => {
                const isActive = i === index;
                const inWindow = circularDistance(i, index, items.length) <= RENDER_WINDOW;
                if (!inWindow) return null;

                return (
                    <div
                        key={`${item.url}-${i}`}
                        className="absolute inset-0 transition-opacity duration-200 ease-out"
                        style={{ opacity: isActive ? 1 : 0, zIndex: isActive ? 1 : 0 }}
                        aria-hidden={!isActive}
                    >
                        {item.type === "video" ? (
                            <video
                                ref={(el) => {
                                    if (el) videoRefs.current.set(i, el);
                                    else videoRefs.current.delete(i);
                                }}
                                src={item.url}
                                className="w-full h-full object-cover"
                                muted
                                loop
                                playsInline
                                preload="auto"
                            />
                        ) : (
                            <Image
                                src={item.url}
                                alt=""
                                fill
                                priority={isActive}
                                sizes="100vw"
                                className="object-cover"
                            />
                        )}
                    </div>
                );
            })}

            <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-xs tracking-wide font-sans">
                move cursor to browse — {index + 1} / {items.length}
            </div>
        </div>
    );
};

export default CursorScrubGallery;
