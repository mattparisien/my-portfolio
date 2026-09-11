import { useEffect, useRef, useState } from 'react';
import { MediaGridItem } from '@/components/StickySections/StickySections';

export function useMediaReady(items: MediaGridItem[]) {
  const [isReady, setIsReady] = useState(false);
  const loadedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadedUrlsRef.current = new Set();
    setIsReady(items.length === 0);
  }, [items]);

  const markLoaded = (url: string) => {
    if (!url) return;

    loadedUrlsRef.current.add(url);

    if (items.length > 0 && loadedUrlsRef.current.size >= items.length) {
      setIsReady(true);
    }
  };

  return {
    isReady,
    markLoaded,
  };
}
