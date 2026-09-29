import { cn } from "@/shared/ui";

export function Segment<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="me-3.5 flex items-center gap-1.5">
      <span className="text-[12px] text-studio-muted">{props.label}</span>
      <div className="flex overflow-hidden rounded-[8px] border border-studio-line">
        {props.options.map((o) => (
          <button
            key={o}
            onClick={() => props.onChange(o)}
            className={cn(
              "cursor-pointer border-none px-2.5 py-1.5 text-[12px]",
              props.value === o ? "bg-studio-accent text-white" : "bg-transparent text-studio-text",
            )}
          >
            {props.labels[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}
