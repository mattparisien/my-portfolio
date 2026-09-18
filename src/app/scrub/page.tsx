"use client"
import { useEffect, useState } from "react";
import CursorScrubGallery from "@/components/CursorScrubGallery";
import { MediaGridItem } from "@/components/StickySections/StickySections";
import { MediaItem } from "@/app/page";

export default function ScrubPage() {
    const [media, setMedia] = useState<MediaGridItem[]>([]);

    useEffect(() => {
        const fetchMedia = async () => {
            try {
                const response = await fetch("/api/cloudinary-images");
                const data = await response.json();
                setMedia((data.media || []) as MediaItem[] as MediaGridItem[]);
            } catch (error) {
                console.error("Error fetching Cloudinary media:", error);
                setMedia([]);
            }
        };

        fetchMedia();
    }, []);

    return <CursorScrubGallery items={media} />;
}
