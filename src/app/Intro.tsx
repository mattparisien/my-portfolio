'use client'
import Image from "next/image";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import { useMediaReady } from "@/app/hooks/useMediaReady";
import { useWindowWidth } from "@/app/hooks/useWindowWidth";
import { SmoothScrollContext } from "@/app/contexts/SmoothScroll.context";
import gsap from "gsap";
import Lightbox from "./Lightbox";

interface IntroProps {
    items: MediaGridItem[]
}

const IS_INTRO_ENABLED = true;

/* -----------------------------
   Layout tuning knobs
-------------------------------- */
const SIDE_PADDING_PCT = 0.02;   // small gutter on each side (fraction of viewport width)
const ROW_GAP_PCT = 0.045;       // vertical gap between rows (fraction of viewport width)
const TOP_PADDING_PCT = -ROW_GAP_PCT; // push the first row up, off the top of the page
const SLOT_FILL = 0.84;          // how much of its horizontal slot an item targets
const SIZE_JITTER = 0.16;        // ± random size variation per item
const MAX_ITEM_PCT = 0.42;       // hard cap on any single item's size
const H_JITTER_FACTOR = 0.8;     // how much of the leftover slot space a middle item can drift into
const V_JITTER_FACTOR = 0;       // vertical stagger within a row (0 = all items share one center line)
const EDGE_BLEED = 0;            // how far an edge item may hang off the viewport (0 = fully on-screen)

/* -----------------------------
   Lightbox knobs
-------------------------------- */
const THUMBNAIL_BAR_WIDTH = 150;  // 64px thumbnail width + 8px horizontal margin
const LIGHTBOX_MARGIN = 0.9;     // max fraction of the viewport the opened image may occupy
const LIGHTBOX_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const TRANSFORM_TRANSITION = `transform 0.6s ${LIGHTBOX_EASE}`;
const OPACITY_TRANSITION = "opacity 0.4s ease";

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

type ActiveLightbox = {
    id: string;
    index: number;
    tx: number;
    ty: number;
    scale: number;
    // true when this state resulted from arrow-key navigation rather than opening/closing
    isNavigating: boolean;
};

const Intro = (props: IntroProps) => {
    const { items } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const hasPlayedIntro = useRef(false);
    const windowWidth = useWindowWidth();
    const { scroll } = useContext(SmoothScrollContext) as { scroll: { stop: () => void; start: () => void } | null };

    // When the intro is enabled, GSAP owns the transforms until it finishes;
    // after that (or immediately, if disabled) React/CSS take over so the
    // lightbox can drive them.
    const [introDone, setIntroDone] = useState(!IS_INTRO_ENABLED);
    const [active, setActive] = useState<ActiveLightbox | null>(null);

    const introItems = useMemo(() => items.slice(0, 5), [items]);
    const { isReady, markLoaded } = useMediaReady(introItems);

    /* -----------------------------
       Build the scattered layout.
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

            const sized = row.map(({ item, index }, ci) => {
                const seed = ri * 131 + ci * 17 + 3;
                const sizeScale = 1 + (seededRandom(seed) - 0.5) * 2 * SIZE_JITTER;
                const target = Math.min(slotW * SLOT_FILL * sizeScale, maxItem);
                const frame = getImageFrameSize(item, target);
                return { item, index, frame, seed, ci };
            });

            const rowHeight = Math.max(...sized.map((s) => s.frame.height));

            const placed = sized.map(({ item, index, frame, seed, ci }) => {
                const slotStart = sidePadding + slotW * ci;
                const freeX = Math.max(0, slotW - frame.width);
                const t = seededRandom(seed + 101);

                let x: number;
                if (count > 1 && ci === 0) {
                    const minX = -frame.width * EDGE_BLEED;
                    const maxX = slotStart + freeX;
                    x = minX + (maxX - minX) * Math.pow(t, 1.8);
                } else if (count > 1 && ci === count - 1) {
                    const minX = slotStart;
                    const maxX = W - frame.width + frame.width * EDGE_BLEED;
                    x = minX + (maxX - minX) * (1 - Math.pow(1 - t, 1.8));
                } else {
                    const slotCenterX = slotStart + slotW / 2;
                    x = slotCenterX + (t - 0.5) * freeX * H_JITTER_FACTOR - frame.width / 2;
                }

                const clampedX = Math.max(0, Math.min(x, W - frame.width));

                const vJitter = (seededRandom(seed + 202) - 0.5) * rowHeight * V_JITTER_FACTOR;
                const localY = (rowHeight - frame.height) / 2 + vJitter;

                return { id: `cell-${index}`, item, x: Math.round(clampedX), localY, frame };
            });

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

        // Keep the first row aligned to the top without introducing an extra
        // vertical offset that would shift the grid upward.
        const yOffset = 0;
        cells.forEach((c) => {
            c.y -= yOffset;
        });

        return { cells, totalHeight: Math.round(cursorY - yOffset) };
    }, [items, windowWidth]);

    /* -----------------------------
       Lightbox open / close / navigate
    -------------------------------- */
    // Shared by clicks and arrow-key navigation so both compute the same transform.
    const openCell = useCallback((cell: LaidOutCell, index: number, isNavigating: boolean) => {
        const wrapper = containerRef.current?.querySelector<HTMLElement>(
            `[data-item-id="${cell.id}"]`
        )?.parentElement;
        if (!wrapper) return;

        // Center on the area to the right of the thumbnail bar by nudging
        // the current translate by the delta between the item's current center
        // and the available content area center.
        const rect = wrapper.getBoundingClientRect();
        const availableWidth = Math.max(0, window.innerWidth - THUMBNAIL_BAR_WIDTH);
        const targetCenterX = THUMBNAIL_BAR_WIDTH + availableWidth / 2;
        const deltaX = targetCenterX - (rect.left + rect.width / 2);
        const deltaY = window.innerHeight / 2 - (rect.top + rect.height / 2);

        // Scale up to fill the available space (excluding the thumbnail bar),
        // but never exceed LIGHTBOX_MARGIN of either dimension.
        const scale = Math.min(
            (availableWidth * LIGHTBOX_MARGIN) / cell.width,
            (window.innerHeight * LIGHTBOX_MARGIN) / cell.height
        );

        document.querySelector("main")?.classList.add('overflow-hidden');
        setActive({
            id: cell.id,
            index,
            tx: cell.x + deltaX,
            ty: cell.y + deltaY,
            scale,
            isNavigating,
        });
    }, []);

    const handleImageClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>, cell: LaidOutCell, index: number) => {
            e.stopPropagation();

            // clicking the already-open image closes it
            if (active?.id === cell.id) {
                document.querySelector("main")?.classList.remove("overflow-hidden");
                setActive(null);
                return;
            }

            openCell(cell, index, false);
        },
        [active, openCell]
    );

    const closeLightbox = useCallback(() => {
        setActive(null);
    }, []);

    const handleThumbnailClick = useCallback(
        (virtualIndex: number) => {
            const total = layout.cells.length;
            if (total === 0) return;
            const realIndex = ((virtualIndex % total) + total) % total;
            openCell(layout.cells[realIndex], virtualIndex, true);
        },
        [layout.cells, openCell]
    );

    // Lock page scroll (including locomotive-scroll) + wire up Escape/arrow keys while open.
    useEffect(() => {
        if (!active) return;

        scroll?.stop();
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setActive(null);
                return;
            }

            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const total = layout.cells.length;
                if (total === 0) return;
                e.preventDefault();
                const delta = e.key === "ArrowRight" ? 1 : -1;
                const nextVirtualIndex = active.index + delta;
                const nextRealIndex = ((nextVirtualIndex % total) + total) % total;
                openCell(layout.cells[nextRealIndex], nextVirtualIndex, true);
            }
        };
        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = prevOverflow;
            scroll?.start();
            window.removeEventListener("keydown", onKey);
        };
    }, [active, layout.cells, openCell, scroll]);

    /* -----------------------------
       Intro sequence (only when IS_INTRO_ENABLED)
    -------------------------------- */
    useEffect(() => {
        if (!IS_INTRO_ENABLED || !isReady || hasPlayedIntro.current) return;

        const root = containerRef.current;
        if (!root) return;

        const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-wrapper]"));
        if (nodes.length === 0) return;

        hasPlayedIntro.current = true;

        // Which items get the fly-in-from-center treatment:
        //   • if any are flagged featured, use those
        //   • otherwise, use only the items currently in view (fully or partially
        //     visible in the viewport at their resting position)
        let featured = nodes.filter((n) => n.dataset.featured === "1");

        if (featured.length === 0) {
            const vh = window.innerHeight;
            featured = nodes.filter((n) => {
                const y = Number(n.dataset.restY);
                const h = Number(n.dataset.height);
                return y < vh && y + h > 0; // vertical overlap with the viewport
            });
        }

        const featuredSet = new Set(featured);
        const others = nodes.filter((n) => !featuredSet.has(n));

        const centerX = (el: HTMLElement) => window.innerWidth / 2 - Number(el.dataset.width) / 2;
        const centerY = (el: HTMLElement) => window.innerHeight / 2 - Number(el.dataset.height) / 2;
        const restX = (el: HTMLElement) => Number(el.dataset.restX);
        const restY = (el: HTMLElement) => Number(el.dataset.restY);

        const ctx = gsap.context(() => {
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

            const tl = gsap.timeline({
                onComplete: () => setIntroDone(true), // hand transforms back to React
            });

            tl.to(featured, {
                scale: 1,
                duration: INTRO_SCALE_IN_DURATION,
                ease: "power3.out",
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
                "-=0.4"
            );

            if (others.length) {
                tl.to(others, { opacity: 1, duration: 0.5, stagger: 0.03 }, "-=0.5");
            }
        }, root);

        return () => ctx.revert();
    }, [isReady, layout]);

    // While GSAP is running the intro, keep transforms out of React's hands.
    const introControlled = IS_INTRO_ENABLED && !introDone;

    return (
        <div className="z-20 block w-screen min-h-screen overflow-hidden">
            <div
                ref={containerRef}
                className="relative w-full"
                style={{ height: `${layout.totalHeight}px` }}
            >
                {layout.cells.map((cell, ci) => {
                    const isActive = active?.id === cell.id;
                    const dimmed = Boolean(active) && !isActive;

                    const transform = isActive
                        ? `translate3d(${active!.tx}px, ${active!.ty}px, 0px) scale(${active!.scale})`
                        : `translate3d(${cell.x}px, ${cell.y}px, 0px)`;

                    // When navigating between lightbox images, snap immediately with no transition
                    const transition = active?.isNavigating
                        ? "none"
                        : `${TRANSFORM_TRANSITION}, ${OPACITY_TRANSITION}`;

                    const wrapperStyle: React.CSSProperties = introControlled
                        ? { willChange: "transform" } // GSAP owns transform/opacity
                        : {
                            transform,
                            opacity: dimmed ? 0 : 1,
                            transition,
                            zIndex: isActive ? 50 : 1,
                            pointerEvents: dimmed ? "none" : "auto",
                            willChange: "transform",
                        };

                    const borderRadius = isActive
                        ? `${12 / active!.scale}px`
                        : "12px";

                    return (
                        <div
                            key={cell.id}
                            data-wrapper
                            data-rest-x={cell.x}
                            data-rest-y={cell.y}
                            data-featured={cell.isFeatured ? "1" : "0"}
                            data-width={cell.width}
                            data-height={cell.height}
                            className={`absolute top-0 left-0${introControlled ? " opacity-0" : ""}`}
                            style={wrapperStyle}
                        >
                            <div
                                className="relative overflow-hidden cursor-pointer"
                                style={{
                                    width: `${cell.width}px`,
                                    height: `${cell.height}px`,
                                    borderRadius,
                                    transition: active?.isNavigating ? "none" : `border-radius 0.6s ${LIGHTBOX_EASE}`,
                                }}
                                data-item-id={cell.id}
                                onClick={(e) => handleImageClick(e, cell, ci)}
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
                    );
                })}

                {/* Click-catcher behind the opened image. Transparent so the page
                    colour shows through as the other images fade out; add a
                    background here if you want a dimmed backdrop. */}
            
                    <Lightbox
                        onClose={closeLightbox}
                        items={items}
                        isActive={active != null}
                        activeIndex={active?.index}
                        onSelectIndex={handleThumbnailClick}
                    />
                
            </div>
        </div>
    );
};

export default Intro;
