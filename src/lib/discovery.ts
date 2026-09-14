/** Keep the top-ranked option, then give countries/regions room before filling runners-up. */
export function diverseCandidates<T extends { country: string; region?: string }>(ranked: T[], limit: number): T[] {
  const chosen: T[] = [];
  const countries = new Map<string, number>();
  const regions = new Set<string>();
  const add = (c: T) => {
    if (chosen.length >= limit || chosen.includes(c)) return;
    chosen.push(c);
    if (c.country) countries.set(c.country, (countries.get(c.country) ?? 0) + 1);
    if (c.region) regions.add(c.region);
  };
  if (ranked[0]) add(ranked[0]);
  for (const c of ranked) if (c.region && !regions.has(c.region)) add(c);
  for (const c of ranked) if (!c.country || !countries.has(c.country)) add(c);
  for (const c of ranked) if (!c.country || (countries.get(c.country) ?? 0) < 2) add(c);
  return chosen;
}
