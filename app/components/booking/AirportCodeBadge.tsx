interface AirportCodeBadgeProps {
  code: string;
  name?: string;
  variant?: "origin" | "destination" | "default";
  size?: "sm" | "md" | "lg";
}

const variantStyles: Record<string, { border: string; bg: string; text: string }> = {
  origin: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
  },
  destination: {
    border: "border-l-red-500",
    bg: "bg-red-50",
    text: "text-red-800",
  },
  default: {
    border: "border-l-sky-500",
    bg: "bg-sky-50",
    text: "text-sky-800",
  },
};

const sizeStyles: Record<string, { code: string; name: string; container: string }> = {
  sm: {
    container: "px-2 py-1",
    code: "text-xs font-bold",
    name: "text-[10px]",
  },
  md: {
    container: "px-3 py-1.5",
    code: "text-sm font-bold",
    name: "text-xs",
  },
  lg: {
    container: "px-4 py-2",
    code: "text-lg font-bold",
    name: "text-sm",
  },
};

export default function AirportCodeBadge({
  code,
  name,
  variant = "default",
  size = "md",
}: AirportCodeBadgeProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <div
      className={`inline-flex flex-col items-start rounded-lg border-l-4 ${v.border} ${v.bg} ${s.container}`}
    >
      <span className={`${s.code} ${v.text} tracking-wider uppercase`}>
        {code}
      </span>
      {name && (
        <span className={`${s.name} text-slate-500`}>{name}</span>
      )}
    </div>
  );
}
