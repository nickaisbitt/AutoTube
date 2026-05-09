import { useState, useEffect, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <button
      onClick={scrollToTop}
      className={`scroll-to-top-btn ${visible ? 'scroll-to-top-visible' : ''}`}
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
