type Props = {
  value: number;
  size?: number;
  interactive?: boolean;
  onChange?: (n: number) => void;
};

/**
 * Distinctive Shootbase star: a chiselled diamond/star hybrid in gold over ink.
 * Intentionally not lucide's default star — sharper geometry, mono-stroke fill.
 */
export function StarRating({ value, size = 18, interactive = false, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= Math.round(value);
        const half = !active && n - 0.5 <= value;
        const className = active ? "text-gold" : half ? "text-gold/50" : "text-ink/15";
        const node = (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={className}
            aria-hidden
          >
            <path
              d="M12 2 L14.2 9.2 L21.5 9.2 L15.7 13.6 L17.9 20.8 L12 16.4 L6.1 20.8 L8.3 13.6 L2.5 9.2 L9.8 9.2 Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeLinejoin="miter"
            />
          </svg>
        );
        return interactive ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            className="cursor-pointer hover:scale-110 transition-transform"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            {node}
          </button>
        ) : (
          <span key={n}>{node}</span>
        );
      })}
    </div>
  );
}
