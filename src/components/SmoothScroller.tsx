'use client';

import { SmoothScrollProvider } from "@/app/contexts/SmoothScroll.context";

const SmoothScroller: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SmoothScrollProvider options={{
      smooth: true,
      smartphone: {
        smooth: true,
      },
      tablet: {
        smooth: true,
      },
    }}>
      {children}
    </SmoothScrollProvider>
  );
}

export default SmoothScroller;