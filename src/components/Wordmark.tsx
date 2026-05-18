import React from 'react';

interface WordmarkProps {
  size?: number;
  className?: string;
}

export function Wordmark({ size = 22, className = '' }: WordmarkProps) {
  return (
    <span className={`wordmark ${className}`} style={{ fontSize: size }}>
      Re<i className="wm-colon">:</i><em>Action</em>
    </span>
  );
}
