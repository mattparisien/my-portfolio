'use client'
import Image from "next/image";
import { useEffect, useMemo, useCallback, useRef } from "react";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import { useMediaReady } from "@/app/hooks/useMediaReady";
import { useWindowWidth } from "@/app/hooks/useWindowWidth";
import gsap from "gsap";

interface IntroProps {
    items: MediaGridItem[]
}

const IS_INTRO_ENABLED = true;

/* -----------------------------
   Layout tuning knobs
-------------------------------- */
const SIDE_PADDING_PCT = 0.02;   // small gutter on each side (fraction of viewport width)
const TOP_PADDING_PCT = 0.08;    // empty space above first row
const ROW_GAP_PCT = 0.045;       // vertical gap between rows (fraction of viewport width)
const SLOT_FILL = 0.84;          // how much of its horizontal slot an item targets
const SIZE_JITTER = 0.16;        // ± random size variation per item
const MAX_ITEM_PCT = 0.42;       // hard cap on any single item's size
const H_JITTER_FACTOR = 0.8;     // how much of the leftover slot space a middle item can drift into
const V_JITTER_FACTOR = 0;       // vertical stagger within a row (0 = all items share one center line)
const EDGE_BLEED = 0;            // how far an edge item may hang off the viewport (0 = fully on-screen)

/* -----------------------------
   Intro animation knobs
-------------------------------- */
const INTRO_SCALE_IN_DURATION = 0.6;
const INTRO_SCALE_IN_STAGGER = 0.06;
const INTRO_FLY_DURATION = 0.9;
const INTRO_FLY_STAGGER = 0.05;

/* Deterministic pseudo-random in [0, 1) — stable across re-renders for a given seed */
const seededRandom = (seed: number) => {
    let t = seed + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const isFeaturedItem = (item: MediaGridItem) =>
    Boolean((item as { isFeatured?: boolean }).isFeatured);

/* Fit an item's natural aspect ratio inside a square target box (contain) */
const getImageFrameSize = (item: MediaGridItem | null | undefined, targetPx: number) => {
    if (!item) {
        return { width: targetPx, height: targetPx };
    }

    const naturalWidth = item.width ?? (item.aspectRatio ? targetPx * item.aspectRatio : targetPx);
    const naturalHeight = item.height ?? (item.aspectRatio ? targetPx / item.aspectRatio : targetPx);

    // no upscale cap — portfolio images are high-res, and we want them to
    // reliably reach the target size so the layout reads as "big"
    const scale = Math.min(targetPx / naturalWidth, targetPx / naturalHeight);

    return {
        width: Math.max(1, Math.round(naturalWidth * scale)),
        height: Math.max(1, Math.round(naturalHeight * scale)),
    };
};

type LaidOutCell = {
    id: string;
    item: MediaGridItem;
    x: number;
    y: number;
    width: number;
    height: number;
    isFeatured: boolean;
};

const Intro = (props: IntroProps) => {
    const { items } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const hasPlayedIntro = useRef(false);
    const windowWidth = useWindowWidth();

    const introItems = useMemo(() => items.slice(0, 5), [items]);
    const { isReady, markLoaded } = useMediaReady(introItems);

    /* -----------------------------
       Build the scattered layout.
       - variable 2 or 3 items per row (seeded, so it varies but is stable)
       - item size scales with how many share the row (fewer = bigger)
       - edge items hug the viewport edge; nothing bleeds off or overlaps
       - all items in a row share one horizontal center line
    -------------------------------- */
    const layout = useMemo<{ cells: LaidOutCell[]; totalHeight: number }>(() => {
        if (!windowWidth || items.length === 0) {
            return { cells: [], totalHeight: 0 };
        }

        const W = windowWidth;
        const sidePadding = W * SIDE_PADDING_PCT;
        const usableW = W - sidePadding * 2;
        const rowGap = W * ROW_GAP_PCT;
        const maxItem = W * MAX_ITEM_PCT;

        // Chunk items into rows of 2 or 3, tracking each item's original index
        // (used as a stable id so images don't remount on resize).
        const rows: Array<{ item: MediaGridItem; index: number }[]> = [];
        let idx = 0;
        let rowSeed = 0;
        while (idx < items.length) {
            const remaining = items.length - idx;
            let count = seededRandom(rowSeed * 7919 + 13) < 0.45 ? 2 : 3;
            count = Math.min(count, remaining);
            const row = [];
            for (let k = 0; k < count; k++) {
                row.push({ item: items[idx + k], index: idx + k });
            }
            rows.push(row);
            idx += count;
            rowSeed++;
        }

        const cells: LaidOutCell[] = [];
        let cursorY = W * TOP_PADDING_PCT;

        rows.forEach((row, ri) => {
            const count = row.length;
            const slotW = usableW / count;

            // Size every item first so we know the row's height.
            const sized = row.map(({ item, index }, ci) => {
                const seed = ri * 131 + ci * 17 + 3;
                const sizeScale = 1 + (seededRandom(seed) - 0.5) * 2 * SIZE_JITTER;
                const target = Math.min(slotW * SLOT_FILL * sizeScale, maxItem);
                const frame = getImageFrameSize(item, target);
                return { item, index, frame, seed, ci };
            });

            const rowHeight = Math.max(...sized.map((s) => s.frame.height));

            // Place each item horizontally within its slot. Edge items bias toward
            // the viewport edge; middle items stay centered. Every item is kept
            // clear of its neighbours' slots, so nothing overlaps.
            const placed = sized.map(({ item, index, frame, seed, ci }) => {
                const slotStart = sidePadding + slotW * ci;
                const freeX = Math.max(0, slotW - frame.width);
                const t = seededRandom(seed + 101);

                let x: number;
                if (count > 1 && ci === 0) {
                    // leftmost: pull toward the left edge
                    const minX = -frame.width * EDGE_BLEED;
                    const maxX = slotStart + freeX; // never crosses into the next slot
                    x = minX + (maxX - minX) * Math.pow(t, 1.8);
                } else if (count > 1 && ci === count - 1) {
                    // rightmost: pull toward the right edge
                    const minX = slotStart; // never crosses into the previous slot
                    const maxX = W - frame.width + frame.width * EDGE_BLEED;
                    x = minX + (maxX - minX) * (1 - Math.pow(1 - t, 1.8));
                } else {
                    // middle: centered with mild jitter
                    const slotCenterX = slotStart + slotW / 2;
                    x = slotCenterX + (t - 0.5) * freeX * H_JITTER_FACTOR - frame.width / 2;
                }

                // guarantee the whole item stays on-screen
                const clampedX = Math.max(0, Math.min(x, W - frame.width));

                const vJitter = (seededRandom(seed + 202) - 0.5) * rowHeight * V_JITTER_FACTOR;
                const localY = (rowHeight - frame.height) / 2 + vJitter;

                return { id: `cell-${index}`, item, x: Math.round(clampedX), localY, frame };
            });

            // Shift the whole row so its top-most item sits exactly at cursorY.
            const localMinTop = Math.min(...placed.map((p) => p.localY));
            const localMaxBottom = Math.max(...placed.map((p) => p.localY + p.frame.height));
            const shift = cursorY - localMinTop;

            placed.forEach((p) => {
                cells.push({
                    id: p.id,
                    item: p.item,
                    x: p.x,
                    y: Math.round(p.localY + shift),
                    width: p.frame.width,
                    height: p.frame.height,
                    isFeatured: isFeaturedItem(p.item),
                });
            });

            cursorY += localMaxBottom - localMinTop + rowGap;
        });

        // Fallback: if nothing is flagged featured, treat every item as featured
        // so the intro still has something to animate.
        if (!cells.some((c) => c.isFeatured)) {
            cells.forEach((c) => {
                c.isFeatured = true;
            });
        }

        return { cells, totalHeight: Math.round(cursorY) };
    }, [items, windowWidth]);

    /* -----------------------------
       Lightbox: center the clicked item's wrapper in the viewport and scale it up.
    -------------------------------- */
    const toggleLightbox = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const parent = target.parentElement;
        if (!parent) return;

        const rect = parent.getBoundingClientRect();

        const deltaX = window.innerWidth / 2 - (rect.left + rect.width / 2);
        const deltaY = window.innerHeight / 2 - (rect.top + rect.height / 2);

        const currentX = (gsap.getProperty(parent, "x") as number) || 0;
        const currentY = (gsap.getProperty(parent, "y") as number) || 0;

        gsap.timeline()
            .to(parent, {
                x: currentX + deltaX,
                y: currentY + deltaY,
                scale: 2,
                zIndex: 50,
                duration: 0.5,
                ease: "power3.out",
            })
            .to(target, { x: 0, y: 0, duration: 0.5, ease: "power3.out" }, 0);
    }, []);

    /* -----------------------------
       Intro sequence (only when IS_INTRO_ENABLED):
         1. featured items start stacked at the viewport center, scaled to 0
         2. they scale in (staggered)
         3. they fly out to their resting grid positions
         4. any non-featured items fade in at their resting spots
       Runs once, after media is ready. GSAP fully owns transform/opacity here,
       so React re-renders (from markLoaded) can't reset the animation.
    -------------------------------- */
    useEffect(() => {
        if (!IS_INTRO_ENABLED || !isReady || hasPlayedIntro.current) return;

        const root = containerRef.current;
        if (!root) return;

        const nodes = Array.from(
            root.querySelectorAll<HTMLElement>("[data-wrapper]")
        );
        if (nodes.length === 0) return;

        hasPlayedIntro.current = true;

        const featured = nodes.filter((n) => n.dataset.featured === "1");
        const others = nodes.filter((n) => n.dataset.featured !== "1");

        const centerX = (el: HTMLElement) =>
            window.innerWidth / 2 - Number(el.dataset.width) / 2;
        const centerY = (el: HTMLElement) =>
            window.innerHeight / 2 - Number(el.dataset.height) / 2;
        const restX = (el: HTMLElement) => Number(el.dataset.restX);
        const restY = (el: HTMLElement) => Number(el.dataset.restY);

        const ctx = gsap.context(() => {
            // initial states
            gsap.set(featured, {
                x: (_i, el) => centerX(el as HTMLElement),
                y: (_i, el) => centerY(el as HTMLElement),
                scale: 0,
                opacity: 1,
            });
            gsap.set(others, {
                x: (_i, el) => restX(el as HTMLElement),
                y: (_i, el) => restY(el as HTMLElement),
                scale: 1,
                opacity: 0,
            });

            const tl = gsap.timeline();

            tl.to(featured, {
                scale: 1,
                duration: INTRO_SCALE_IN_DURATION,
                ease: "back.out(1.5)",
                stagger: INTRO_SCALE_IN_STAGGER,
            }).to(
                featured,
                {
                    x: (_i, el) => restX(el as HTMLElement),
                    y: (_i, el) => restY(el as HTMLElement),
                    duration: INTRO_FLY_DURATION,
                    ease: "power3.inOut",
                    stagger: INTRO_FLY_STAGGER,
                },
                "+=0.1"
            );

            if (others.length) {
                tl.to(
                    others,
                    { opacity: 1, duration: 0.5, stagger: 0.03 },
                    "-=0.5"
                );
            }
        }, root);

        return () => ctx.revert();
    }, [isReady, layout]);

    return (
        <div className="z-20 block w-screen min-h-screen overflow-hidden">
            <div
                ref={containerRef}
                className="relative w-full"
                style={{ height: `${layout.totalHeight}px` }}
            >
                {layout.cells.map((cell, ci) => (
                    <div
                        key={cell.id}
                        data-wrapper
                        data-rest-x={cell.x}
                        data-rest-y={cell.y}
                        data-featured={cell.isFeatured ? "1" : "0"}
                        data-width={cell.width}
                        data-height={cell.height}
                        className={`absolute top-0 left-0${IS_INTRO_ENABLED ? " opacity-0" : ""}`}
                        style={
                            IS_INTRO_ENABLED
                                ? { willChange: "transform" }
                                : {
                                      transform: `translate3d(${cell.x}px, ${cell.y}px, 0px)`,
                                      willChange: "transform",
                                  }
                        }
                    >
                        <div
                            className="relative overflow-hidden rounded-xl"
                            style={{ width: `${cell.width}px`, height: `${cell.height}px` }}
                            data-item-id={cell.id}
                            data-width={cell.width}
                            data-height={cell.height}
                            onClick={toggleLightbox}
                        >
                            {cell.item.type === "video" ? (
                                <video
                                    src={cell.item.url}
                                    className="block h-full w-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                    autoPlay
                                    onLoadedData={() => markLoaded(cell.item.url)}
                                />
                            ) : (
                                <Image
                                    src={cell.item.url}
                                    alt=""
                                    width={cell.width}
                                    height={cell.height}
                                    sizes="(max-width: 768px) 50vw, 33vw"
                                    className="block h-full w-full object-cover"
                                    priority={ci < 3}
                                    onLoad={() => markLoaded(cell.item.url)}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Intro;
