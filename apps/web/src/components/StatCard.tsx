import type { LucideIcon } from "lucide-react";

export function StatCard({ label, value, icon: Icon, tone = "pine" }: { label: string; value: string | number; icon: LucideIcon; tone?: "pine" | "coral" | "amber" | "ink" }) {
  const tones = {
    pine: "bg-pine/10 text-pine",
    coral: "bg-coral/10 text-coral",
    amber: "bg-amber/10 text-amber",
    ink: "bg-ink/10 text-ink"
  };

  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-md ${tones[tone]}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}
