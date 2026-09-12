'use client'
import Image from "next/image";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import { useMediaReady } from "@/app/hooks/useMediaReady";
import { useWindowWidth } from "@/app/hooks/useWindowWidth";
import gsap from "gsap";
import { v4 as uuid_v4 } from 'uuid';

interface IntroProps {
    items: MediaGridItem[]
}


const ROW_ITEM_COUNT_PATTERN = [3, 2];
const CELL_OFFSET_Y_PCT = 0.3;
const CELL_OFFSET_X_PCT = 0.25;
const IS_INTRO_ENABLED = false;

const chunkArray = (arr: MediaGridItem[], pattern: number[]) => {
    const chunks: MediaGridItem[][] = [];
    let currentIdx = 0;
    let currentPatternIdx = 0;

    if (pattern.length === 0) return chunks;

    while (currentIdx < arr.length) {
        const size = pattern[currentPatternIdx % pattern.length];
        chunks.push(arr.slice(currentIdx, currentIdx + size));
        currentIdx += size;
        currentPatternIdx++;
    }

    return chunks;
};

const getImageFrameSize = (item: MediaGridItem | null | undefined, cellSizePx: number) => {
    if (!item) {
        return { width: cellSizePx, height: cellSizePx };
    }

    const naturalWidth = item.width ?? (item.aspectRatio ? cellSizePx * item.aspectRatio : cellSizePx);
    const naturalHeight = item.height ?? (item.aspectRatio ? cellSizePx / item.aspectRatio : cellSizePx);

    const scale = Math.min(cellSizePx / naturalWidth, cellSizePx / naturalHeight, 1);

    return {
        width: Math.max(1, Math.round(naturalWidth * scale)),
        height: Math.max(1, Math.round(naturalHeight * scale)),
    };
};

type GridCell = {
    id: string;
    item: MediaGridItem | null;
    offsetPx: {
        x: number;
        y: number;
    };
} | null;

const Intro = (props: IntroProps) => {
    const { items } = props;
    const [isIntro, setIsIntro] = useState(IS_INTRO_ENABLED);
    const [isIntroReady, setIsIntroReady] = useState(false);
    const [grid, setGrid] = useState<{ cellSizePx: number; gapSizePct: number; colCount: number }>({
        cellSizePx: 0,
        gapSizePct: 0.1,
        colCount: 5,
    });


    const itemRefs = useRef<HTMLDivElement[]>([]);
    const gridItems = useMemo<Array<GridCell[]>>(() => {

        const chunkedItems = chunkArray(items, ROW_ITEM_COUNT_PATTERN);

        const gridItems = chunkedItems.map((row): GridCell[] => {
            if (row.length === 2) {
                return [
                    null,
                    {
                        id: uuid_v4(),
                        item: row[0],
                        offsetPx: {
                            x: 0,
                            y: 0
                        }
                    },
                    null,
                    {
                        id: uuid_v4(),
                        item: row[1],
                        offsetPx: {
                            x: 0,
                            y: 0
                        }
                    },
                    null
                ];
            }

            return [
                {
                    id: uuid_v4(),
                    item: row[0],
                    offsetPx: {
                        x: 0,
                        y: 0
                    }
                },
                null,
                {
                    id: uuid_v4(),
                    item: row[1],
                    offsetPx: {
                        x: 0,
                        y: 0
                    }
                },
                null,
                {
                    id: uuid_v4(),
                    item: row[2],
                    offsetPx: {
                        x: 0,
                        y: 0
                    }
                }
            ];
        });

        for (let i = 0; i < gridItems.length; i++) {
            const currentRow = gridItems[i] ?? [];
            const cellCount = currentRow.filter((x) => x).length;

            for (let j = 0; j < currentRow.length; j++) {
                const cell = currentRow[j];
                if (cell && cell.item) {
                    cell.offsetPx.y = ((grid.cellSizePx * CELL_OFFSET_Y_PCT) * (i + 1)) * -1;


                    if (cellCount === 3) {
                        if (j === 0) {
                            cell.offsetPx.x = (grid.cellSizePx * CELL_OFFSET_X_PCT) * -1;
                        } else if (j === 4) {
                            cell.offsetPx.x = (grid.cellSizePx * CELL_OFFSET_X_PCT);
                        }
                    } else if (cellCount === 2) {

                        if (j === 1) {
                            cell.offsetPx.x = (grid.cellSizePx * (CELL_OFFSET_X_PCT / 2)) * -1;

                        } else if (j === 3) {
                            cell.offsetPx.x = (grid.cellSizePx * (CELL_OFFSET_X_PCT / 2));
                        }
                    }


                }


            }
        }

        return gridItems;

    }, [items, grid]);



    const windowWidth = useWindowWidth();

    const introItems = useMemo(() => items.slice(0, 5), [items]);
    const { isReady, markLoaded } = useMediaReady(introItems);

    const introPositions = useMemo(() => {
        if (itemRefs.current && itemRefs.current.length > 0) {

            return itemRefs.current.map(item => {
                const { top, left } = item.getBoundingClientRect();
                return {
                    id: item.dataset.itemId,
                    x: -left + (window.innerWidth / 2) - (item.dataset.width / 2),
                    y: -top + (window.innerHeight / 2) - (item.dataset.height / 2)

                }
            })
        }
    }, [isReady, gridItems, grid]);

    const getIntroPosition = useCallback((id: string) => {
        return introPositions?.find(x => x.id === id);
    }, [introPositions])

    const addToRefs = (el: HTMLDivElement | null) => {
        if (el && !itemRefs.current.includes(el)) {
            itemRefs.current.push(el);
        }
    };

    const toggleLightbox = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const parent = target.parentElement;


        if (!parent) return;

        const rect = parent.getBoundingClientRect();

        const elCenterX = rect.left + rect.width / 2;
        const elCenterY = rect.top + rect.height / 2;

        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;

        const deltaX = viewportCenterX - elCenterX;
        const deltaY = viewportCenterY - elCenterY;

        // current GSAP x/y (defaults to 0 if untransformed)
        const currentX = (gsap.getProperty(parent, "x") as number) || 0;
        const currentY = (gsap.getProperty(parent, "y") as number) || 0;

        const scaleFactor = 2;
        const width = (parent.dataset.width || 0) * scaleFactor;
        const height = (parent.dataset.height || 0) * scaleFactor;


        const tl = gsap.timeline();
        tl.to(parent, {
            x: currentX + deltaX,
            y: currentY + deltaY,
            scale: 2,

            duration: 0.5,
            ease: "power3.out",
        })
            .to(target, {
                x: 0,
                y: 0,
                duration: 0.5,
                ease: "power3.out",
            }, 0)
    }, []);


    useEffect(() => {
        const cellSizePx = Math.round(windowWidth / 5);

        setGrid((prev) => {
            if (prev.cellSizePx === cellSizePx) return prev;
            return {
                ...prev,
                cellSizePx,
            };
        });
    }, [windowWidth]);


    const setIntroPositions = useCallback((items) => {

        return introPositions?.forEach(item => {
            const node = items.find(x => x.dataset.itemId === item.id);
            if (node) {
                node.style.transform = `translate3d(${node.dataset.introPositionX}px, ${node.dataset.introPositionY}px, 0px)`;
            }
        })
    }, [introPositions])




    useEffect(() => {
        if (isReady && itemRefs.current && itemRefs.current.length > 0 && IS_INTRO_ENABLED) {
            // Set intro positions

            const inViewRefs = itemRefs.current.filter(item => {
                const rect = item.getBoundingClientRect();
                return (
                    rect.top < (window.innerHeight + (window.innerHeight / 2))
                );
            });

            const invisibleRefs = itemRefs.current.filter(item => !inViewRefs.includes(item));

            gsap.set(invisibleRefs, { opacity: 1, x: (idx, node) => node.dataset.positionX, y: (idx, node) => node.dataset.positionY });
            setIntroPositions(inViewRefs);

            const tl = gsap.timeline();
            tl.fromTo(inViewRefs, { opacity: 1, scale: 0 }, { opacity: 1, scale: 1, stagger: 0.07, duration: 0.5, ease: "power4.out" })
                .to(inViewRefs, { x: (idx, node) => node.dataset.positionX, y: (idx, node) => node.dataset.positionY, ease: "power3.out", duration: 1, stagger: 0.01 })





        }
    }, [isReady])

    const getPosition = useCallback((cellId: string, mediaWidth: number, mediaHeight: number) => {
        const el = document.querySelector(`[data-cell-id="${cellId}"]`);

        if (!el) {
            return {
                x: 0,
                y: 0
            }
        }

        const { top, left, width, height } = el.getBoundingClientRect();

        const cellCenterX = left + width / 2;
        const cellCenterY = top + height / 2;

        return {
            x: cellCenterX - (mediaWidth / 2),
            y: cellCenterY - mediaHeight / 2 
        }
    }, [grid])


    return (
        <div className="z-20 block w-screen min-h-screen overflow-hidden">
            <div className="relative w-full h-full">
                <div className="virtual-grid w-full h-full flex flex-col">
                    {gridItems.map((row, ri) => (
                        <div className="row flex justify-between" key={ri}>
                            {row?.map((cell, ci) => {
                                const imageFrameSize = getImageFrameSize(cell?.item ?? null, grid.cellSizePx);
                                const introPosition = getIntroPosition(cell?.id as string);

                                return (
                                    <div key={ci}
                                        data-width={grid.cellSizePx}
                                        data-height={grid.cellSizePx}
                                        data-cell-id={cell?.id}
                                        data-offset-x={cell?.offsetPx.x}
                                        data-offset-y={cell?.offsetPx.y}
                                        style={{
                                            width: `${grid.cellSizePx}px`,
                                            height: `${grid.cellSizePx}px`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            position: "relative"
                                        }}
                                    >
                                        {/* <div
                                            className="relative overflow-hidden rounded-md"
                                            style={{
                                                width: `${imageFrameSize.width}px`,
                                                height: `${imageFrameSize.height}px`,
                                                opacity: 0
                                            }}
                                            ref={self => addToRefs(self)}
                                            data-item-id={cell?.id}
                                            data-width={imageFrameSize.width}
                                            data-height={imageFrameSize.height}
                                            data-intro-position-x={introPosition?.x}
                                            data-intro-position-y={introPosition?.y}
                                            data-position-x={cell?.offsetPx.x}
                                            data-position-y={cell?.offsetPx.y}
                                            onClick={toggleLightbox}
                                        >


                                            {cell?.item?.type === 'video' ? (
                                                <video
                                                    src={cell.item.url}
                                                    className="block h-full w-full object-cover"
                                                    muted
                                                    loop
                                                    playsInline
                                                    autoPlay
                                                    onLoadedData={() => cell.item && markLoaded(cell.item.url)}
                                                />
                                            ) : cell?.item ? (
                                                <Image
                                                    src={cell.item.url}
                                                    alt=""
                                                    width={imageFrameSize.width}
                                                    height={imageFrameSize.height}
                                                    sizes="200px"
                                                    className="block h-full w-full object-cover"
                                                    priority={ci < 3}
                                                    onLoad={() => cell.item && markLoaded(cell.item.url)}

                                                />
                                            ) : null}
                                        </div> */}
                                    </div>
                                );
                            })}

                        </div>
                    ))}
                </div>
                {gridItems.map((row, ri) => (
                    row?.map((cell, ci) => {
                        const imageFrameSize = getImageFrameSize(cell?.item ?? null, grid.cellSizePx);
                        const introPosition = getIntroPosition(cell?.id as string);
                        const { x, y } = getPosition(cell?.id, imageFrameSize.width, imageFrameSize.height);
                        return (
                            <div className="absolute top-0 left-0" key={ci} style={{
                                transform: `translate3d(${x}px, ${y}px, 0px)`,

                            }}>
                                <div
                                    className="relative overflow-hidden rounded-md"
                                    style={{
                                        width: `${imageFrameSize.width}px`,
                                        height: `${imageFrameSize.height}px`,
                                        opacity: 1
                                    }}
                                    ref={self => addToRefs(self)}
                                    data-item-id={cell?.id}
                                    data-width={imageFrameSize.width}
                                    data-height={imageFrameSize.height}
                                    data-intro-position-x={introPosition?.x}
                                    data-intro-position-y={introPosition?.y}
                                    data-position-x={x}
                                    data-position-y={y}
                                    data-offset-x={cell?.offsetPx.x}
                                    data-offset-y={cell?.offsetPx.y}
                                    onClick={toggleLightbox}
                                >


                                    {cell?.item?.type === 'video' ? (
                                        <video
                                            src={cell.item.url}
                                            className="block h-full w-full object-cover"
                                            muted
                                            loop
                                            playsInline
                                            autoPlay
                                            onLoadedData={() => cell.item && markLoaded(cell.item.url)}
                                        />
                                    ) : cell?.item ? (
                                        <Image
                                            src={cell.item.url}
                                            alt=""
                                            width={imageFrameSize.width}
                                            height={imageFrameSize.height}
                                            sizes="200px"
                                            className="block h-full w-full object-cover"
                                            priority={ci < 3}
                                            onLoad={() => cell.item && markLoaded(cell.item.url)}

                                        />
                                    ) : null}
                                </div>
                            </div>
                        )

                    })
                ))}
                {/* {items.map((item, i) => (
                    <div
                        key={i}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{
                            width: "200px",
                            height: "200px",
                            opacity: 0,
                            animation: isReady ? `introReveal 0ms ease-out forwards` : 'none',
                            animationDelay: isReady ? `${i * 200}ms` : '0ms',
                        }}
                    >
                        {item.type === 'video' ? (
                            <video
                                src={item.url}
                                className="w-full h-full object-contain"
                                muted
                                loop
                                playsInline
                                autoPlay
                                onLoadedData={() => markLoaded(item.url)}
                            />
                        ) : (
                            <Image
                                src={item.url}
                                alt=""
                                fill
                                sizes="200px"
                                className="object-contain"
                                priority={i < 3}
                                onLoad={() => markLoaded(item.url)}
                            />
                        )}
                    </div>
                ))} */}
            </div>
        </div>
    )
}

export default Intro;