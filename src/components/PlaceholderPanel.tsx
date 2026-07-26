// Roadmap placeholder. Reuses the dashed-border idiom from the homepage
// hero so the dashboard communicates upcoming MVP features without
// implying they work yet. Static — no logic.
interface Props {
  title: string;
  note: string;
}

export function PlaceholderPanel({ title, note }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-6">
      <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
        {title}
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">{note}</p>
    </div>
  );
}
