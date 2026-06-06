export interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

const variantStyles: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  text: "rounded-md",
  circular: "rounded-full",
  rectangular: "rounded-lg",
};

export default function Skeleton({
  className,
  variant = "text",
  width,
  height,
}: SkeletonProps) {
  return (
    <div
      className={[
        "animate-pulse bg-slate-200 dark:bg-slate-700",
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...(variant === "text" && !height ? { height: "1rem" } : {}),
      }}
      aria-hidden="true"
    />
  );
}
