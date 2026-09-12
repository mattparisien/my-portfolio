"use client"
import { MediaGridItem } from '@/components/StickySections/StickySections';
import { useEffect, useState } from 'react';
import Intro from './Intro';

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  format: string;
  isFeatured?: boolean;
}

// Simple seeded random generator (mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates shuffle with seed
function shuffle(array: unknown[], seed: number) {
  const random = mulberry32(seed);
  const arr = array.slice(); // copy so original isn’t mutated
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


export default function Home() {
  const [media, setMedia] = useState<MediaGridItem[]>([]);

  // Fetch and preload media from Cloudinary folder
  useEffect(() => {
 
    const fetchMedia = async () => {
      try {
        const response = await fetch('/api/cloudinary-images');
        const data = await response.json();
        const mediaItems = (data.media || []) as MediaItem[];

        const featuredItems = shuffle(mediaItems.filter(item => item.isFeatured), 2);
        const nonFeaturedItems = mediaItems.filter(item => !item.isFeatured);

        const orderedMedia = [
          ...featuredItems,
          ...shuffle(nonFeaturedItems, 3),
        ] as MediaGridItem[];

        setMedia(orderedMedia);
      } catch (error) {
        console.error('Error fetching Cloudinary media:', error);
        setMedia([]);
      }
    };

    fetchMedia();
  }, []);

  const styles = {
    fontFamily: 'Pantasia, serif',
    fontWeight: "300",
  };

  return (
    <>
      <main
        style={{
          minHeight: '100dvh',
          WebkitMinHeight: '-webkit-fill-available',
        } as React.CSSProperties}
        data-scroll-container
        className="bg-[#C8D157]"
      >
        {/* <div className="flex flex-col justify-between items-start w-screen fixed top-0 left-0 sm:px-8 sm:py-5 px-4 py-3 bg-yellow-300">
          <h2
            className="font-heading text-black text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.1] font-light"
          >
            <div className="flex flex-col justify-between">
              <div className='flex justify-between pb-10'><div>Matthew Parisien</div> <div>(1997)<div className='w-20'></div></div></div>
              <div>Montreal-based software developer and visual artist blending technical and creative thinking. Currently in data engineering at Innocap and represented by <a href="https://www.creamworldwide.com/" target="_blank" className="underline decoration-2 underline-offset-5 hover:no-underline">Cream Creators</a>. Scroll to see creative work.</div>
            </div>
          </h2>
          <div className='flex items-center justify-between w-full' style={{ ...styles, fontWeight: 400 }} >
            <div className='text-md sm:text-lg md:text-xl font-serif'>Matthew Parisien</div>
            <a className='text-md sm:text-lg md:text-xl font-serif underline decoration-1 underline-offset-3 hover:!no-underline' href='mailto:matthewparisien4@gmail.com'>matthewparisien4@gmail.com</a>
          </div>
        </div> */}
        {/* <Intro items={media} /> */}
        {/* <DraggableOverlay items={[{
          url: "https://imagedelivery.net/Ti1_uXa4Q9gNync1g-YdPA/fcb1630d-777f-4499-7716-05e2ca754000/public",
          type: "image",
          width: 805,
          height: 701,
          aspectRatio: 805 / 701
        }, {
          url: "https://imagedelivery.net/Ti1_uXa4Q9gNync1g-YdPA/c26bba74-7388-40b5-b445-a786b3f21f00/public",
          type: "image",
          width: 683,
          height: 701,
          aspectRatio: 683 / 701
        }]} /> */}
        {/* {media.length > 0 && <StickySections items={media} isActive={false} />} */}
        {media.length > 0 && <Intro items={media} />}
        {/* <div className="text-[5vw] font-sans fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 font-medium opacity-30">Matthew Parisien</div> */}
      </main >


    </>
  );
}

