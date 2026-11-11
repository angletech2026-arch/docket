export const nt = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

/** "15%" -> 15, "NT$22/KGM" -> null */
export function pct(duty: string | undefined): number | null {
  if (!duty) return null;
  const m = duty.trim().match(/^(\d+(?:\.\d+)?)%$/);
  return m ? Number(m[1]) : null;
}
