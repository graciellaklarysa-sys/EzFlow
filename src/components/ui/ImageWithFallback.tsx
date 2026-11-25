import { useState } from 'react';
import { Coffee, UtensilsCrossed } from 'lucide-react';

interface ImageWithFallbackProps {
  src?: string;
  alt: string;
  categoryName?: string;
  className?: string;
}

export function ImageWithFallback({
  src,
  alt,
  categoryName,
  className = 'w-full h-36 object-cover',
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const isFood = categoryName?.toLowerCase().includes('pastry') || categoryName?.toLowerCase().includes('makanan');
    return (
      <div
        className={`${className} bg-slate-100 flex flex-col items-center justify-center text-slate-400 border-b border-slate-200 px-3 text-center`}
      >
        {isFood ? (
          <UtensilsCrossed className="w-7 h-7 mb-1.5 text-slate-400" />
        ) : (
          <Coffee className="w-7 h-7 mb-1.5 text-slate-400" />
        )}
        <span className="text-[11px] font-medium text-slate-500 line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
