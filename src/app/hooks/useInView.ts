import { useEffect, useState, RefObject } from 'react';

interface UseInViewOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useInView<T extends Element>(
  refs: RefObject<T>[],
  options: UseInViewOptions = {}
): boolean[] {
  const { threshold = 0, rootMargin = '0px', triggerOnce = false } = options;
  const [inViewStates, setInViewStates] = useState<boolean[]>(
    refs.map(() => false)
  );

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    refs.forEach((ref, index) => {
      if (!ref.current) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          const isInView = entry.isIntersecting;
          
          setInViewStates((prev) => {
            const newStates = [...prev];
            if (triggerOnce && prev[index]) {
              return prev;
            }
            newStates[index] = isInView;
            return newStates;
          });
        },
        { threshold, rootMargin }
      );

      observer.observe(ref.current);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [refs, threshold, rootMargin, triggerOnce]);

  return inViewStates;
}
