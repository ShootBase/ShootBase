import type { SVGProps } from "react";

/**
 * Premium gold coin icon. Uses inline gradients so it renders correctly
 * anywhere (light/dark surfaces) without CSS dependencies.
 */
export function CoinIcon({
  size = 20,
  className,
  ...props
}: { size?: number | string } & Omit<SVGProps<SVGSVGElement>, "size">) {
  const id = `coin-grad-${Math.random().toString(36).slice(2, 9)}`;
  const rimId = `coin-rim-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <radialGradient id={id} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFE7A0" />
          <stop offset="55%" stopColor="#E6B547" />
          <stop offset="100%" stopColor="#A8761B" />
        </radialGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD56B" />
          <stop offset="100%" stopColor="#8C5E12" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill={`url(#${rimId})`} />
      <circle cx="12" cy="12" r="9" fill={`url(#${id})`} />
      <circle cx="12" cy="12" r="9" fill="none" stroke="#7A4E0C" strokeOpacity="0.35" strokeWidth="0.6" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontFamily="ui-serif, Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="10.5"
        fill="#5A3A0A"
      >
        ¢
      </text>
    </svg>
  );
}

export default CoinIcon;
