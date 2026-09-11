'use client';

import { useWindowResize } from './useWindowResize';

export function useWindowWidth(): number {
  const { width } = useWindowResize();

  return width;
}
