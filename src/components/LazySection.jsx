import React, { useState, useEffect, useRef, Suspense } from 'react';

const LazySection = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before the element is visible
        threshold: 0.01
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="min-h-[100px]">
      {isVisible ? (
        <Suspense fallback={<div className="w-full h-96 flex items-center justify-center text-gray-800"><div className="animate-pulse">Загрузка...</div></div>}>
          {children}
        </Suspense>
      ) : (
        <div className="w-full h-20" aria-hidden="true" /> // Placeholder
      )}
    </div>
  );
};

export default LazySection;

