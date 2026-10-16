import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  size?: number | string;
}

export function KlodexIcon({
  className,
  size = 20,
}: Props) {
  const pixelSize = typeof size === "number" ? `${size}px` : size;

  return (
    <img
      src="/klodex-k.png"
      alt="klodex"
      draggable={false}
      className={cn("shrink-0 object-contain dark:invert-0 invert select-none", className)}
      style={{
        width: pixelSize,
        height: pixelSize,
      }}
    />
  );
}

export function KlodexFullLogo({
  className,
  height = 32,
}: {
  className?: string;
  height?: number | string;
}) {
  const pixelHeight = typeof height === "number" ? `${height}px` : height;
  return (
    <img
      src="/klodex-transparent.png"
      alt="klodex"
      draggable={false}
      className={cn("shrink-0 object-contain dark:invert-0 invert select-none", className)}
      style={{ height: pixelHeight, width: "auto" }}
    />
  );
}
