import logoAsset from "@/assets/shootbase-logo.png.asset.json";

export function ShootbaseLogo({ className = "h-20 w-auto" }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Shootbase"
      className={className}
      loading="eager"
      decoding="async"
    />
  );
}
