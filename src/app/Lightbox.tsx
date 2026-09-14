import Image from "next/image";
import { useMemo } from "react";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import classNames from "classnames";

interface LightboxProps {
    items: MediaGridItem[];
    isActive: boolean;
    activeIndex?: number;
    onClose: () => void;
    onSelectIndex?: (index: number) => void;
}

const ITEM_HEIGHT = 72;
const WINDOW_RADIUS = 25;

const ThumbnailCell = ({
    item,
    isActive,
    top,
    onClick,
}: {
    item: MediaGridItem;
    isActive: boolean;
    top: number;
    onClick: () => void;
}) => {
    return (
        <div
            style={{ top: `${top}px` }}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className="absolute left-0 w-[72px] h-[72px] flex items-center justify-center cursor-pointer"
        >
            <div
                className={classNames(
                    "w-16 h-16 shrink-0 rounded-sm bg-gray-300 relative overflow-hidden transition-all duration-150",
                    isActive ? "opacity-100 cale-105" : "opacity-30 hover:opacity-75"
                )}
            >
                {item.type === "video" ? (
                    <video
                        src={item.url}
                        muted
                        playsInline
                        className="w-full h-full object-cover pointer-events-none"
                    />
                ) : (
                    <Image
                        src={item.url}
                        alt=""
                        width={64}
                        height={64}
                        sizes="64px"
                        loading="lazy"
                        className="w-full h-full object-cover pointer-events-none"
                    />
                )}
            </div>
        </div>
    );
};

const Lightbox = (props: LightboxProps) => {
    const activeIndex = props.activeIndex ?? 0;
    const total = props.items.length;

    // Build a window of repeated thumbnail entries around the active index
    // so navigating before the first item or after the last item is seamless and infinite.
    const visibleThumbnails = useMemo(() => {
        if (!props.isActive || total === 0) return [];
        const list = [];
        for (let k = activeIndex - WINDOW_RADIUS; k <= activeIndex + WINDOW_RADIUS; k++) {
            const realIndex = ((k % total) + total) % total;
            list.push({
                virtualIndex: k,
                item: props.items[realIndex],
                isActive: k === activeIndex,
                top: k * ITEM_HEIGHT,
            });
        }
        return list;
    }, [props.isActive, props.items, activeIndex, total]);

    return (
        <div
            className={
                classNames(
                    "fixed inset-0 z-40 overflow-hidden",
                    props.isActive
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                )
            }
            style={{ cursor: "zoom-out" }}
            onClick={props.onClose}
        >
            <div className="relative w-full h-full pointer-events-none">
                {/* Square thumbnail band translated on Y to always center the active thumbnail */}
                {props.isActive && (
                    <div
                        className="absolute left-0 top-0 w-[72px] h-full pointer-events-auto"
                        style={{
                            transform: `translate3d(20px, calc(50vh - ${activeIndex * ITEM_HEIGHT + ITEM_HEIGHT / 2}px), 0)`,
                            transition: "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                    >
                        {visibleThumbnails.map((thumb) => (
                            <ThumbnailCell
                                key={thumb.virtualIndex}
                                item={thumb.item}
                                isActive={thumb.isActive}
                                top={thumb.top}
                                onClick={() => props.onSelectIndex?.(thumb.virtualIndex)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Lightbox;