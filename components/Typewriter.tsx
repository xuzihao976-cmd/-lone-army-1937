
import React, { useState, useEffect, useRef } from 'react';
import { playSound } from '../utils/sound';

interface TypewriterProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

const Typewriter: React.FC<TypewriterProps> = ({ text, speed = 30, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep ref updated with latest callback to avoid effect re-triggering
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Reset only when TEXT changes
    setDisplayedText('');
    indexRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      // Check if we reached the end
      if (indexRef.current < text.length) {
        // Use functional update to avoid dependency on displayedText
        const char = text.charAt(indexRef.current);
        setDisplayedText((prev) => prev + char);
        
        // Play sound every few chars to avoid annoying spam
        if (indexRef.current % 3 === 0) {
            playSound('type');
        }

        indexRef.current++;
      } else {
        // Finished typing
        if (timerRef.current) clearInterval(timerRef.current);
        if (onCompleteRef.current) onCompleteRef.current();
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed]); 

  return (
    <span className="whitespace-pre-wrap leading-relaxed tracking-wide">
      {displayedText}
      {/* Only show cursor if typing is in progress */}
      {indexRef.current < text.length && <span className="typing-cursor"></span>}
    </span>
  );
};

export default Typewriter;
