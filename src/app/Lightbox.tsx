import Image from "next/image";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import classNames from "classnames";

interface LightboxProps {
    items: MediaGridItem[];
    isActive: boolean;
    onClose: () => void;
}

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
                            <div key={i} className="w-16 h-16 rounded-sm m-1 bg-gray-300 relative overflow-hidden opacity-50">
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
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Lightbox;