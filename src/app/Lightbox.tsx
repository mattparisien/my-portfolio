import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import classNames from "classnames";

interface LightboxProps {
    items: MediaGridItem[];
    isActive: boolean;
    onClose: () => void;
}

// Defers mounting its <Image> until the placeholder is actually near the viewport,
// so an open lightbox doesn't fire off a full-res fetch for every item at once.
const ThumbnailCell = ({ item }: { item: MediaGridItem }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (visible || !ref.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setVisible(true);
            },
            { rootMargin: "200px" }
        );
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [visible]);

    return (
        <div ref={ref} className="w-16 h-16 rounded-sm m-1 bg-gray-300 relative overflow-hidden opacity-50">
            {visible && (
                <Image
                    src={item.url}
                    alt=""
                    width={64}
                    height={64}
                    quality={40}
                    sizes="64px"
                    loading="lazy"
                    className="w-full h-full object-cover"
                />
            )}
        </div>
    );
};

const Lightbox = (props: LightboxProps) => {
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
            <div className="relative w-full h-full">
                {/* Square thumbnail band - only mount once the lightbox has actually opened,
                    and let next/image downscale the source instead of fetching full-res files */}
                {props.isActive && (
                    <div className="flex flex-col absolute left-0 top-0">
                        {props.items.map((item, i) => (
                            <ThumbnailCell key={i} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Lightbox;