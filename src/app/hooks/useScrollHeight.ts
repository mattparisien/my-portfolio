import { useEffect, useState } from 'react';

export const useScrollHeight = () => {
    const [scrollHeight, setScrollHeight] = useState(0);

    useEffect(() => {
        const updateScrollHeight = () => {
            setScrollHeight(window.scrollY);
        };

        // Set initial value
        updateScrollHeight();

        // Update on scroll
        window.addEventListener('scroll', updateScrollHeight, { passive: true });

        return () => {
            window.removeEventListener('scroll', updateScrollHeight);
        };
    }, []);

    return scrollHeight;
};
