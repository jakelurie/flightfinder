import { addDays, daysBetween, parseISO, weekday } from "./dates";
import { PLACE_ALIASES, REGION_ALIASES, REGION_LABELS, findDestination } from "./geo";
import type { Interest, TripIntent } from "./types";

// Rule-based interpreter used when no ANTHROPIC_API_KEY is configured (or the model call fails).
// It understands the common phrasings well enough to drive the pipeline end to end.

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, couple: 2, "a couple": 2, "couple of": 2, three: 3, few: 3, "a few": 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function num(word: string): number | undefined {
  const w = word.trim().toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w];
}

export function baseIntent(today: string, origins: string[]): TripIntent {
  return {
    tripType: "round_trip",
    routeCandidates: [],
    summary: "An open-ended trip in the next few weeks.",
    origins,
    destinationMode: "anywhere",
    destinationLabel: null,
    destinationAirports: [],
    regions: [],
    scope: "any",
    earliestDeparture: addDays(today, 3),
    latestDeparture: addDays(today, 35),
    tripNightsMin: 5,
    tripNightsMax: 9,
    budgetMax: null,
    cabin: "economy",
    maxStops: null,
    preferNonstop: false,
    maxFlightHours: null,
    departTimePrefs: [],
    nearbyAirportsOk: true,
    priceSensitivity: "medium",
    flightQualityImportance: "medium",
    wantsFarAway: false,
    interests: [],
    weather: "any",
    adventurousness: "medium",
    excludeDestinations: [],
    assumptions: [],
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ruleInterpret(
  text: string,
  today: string,
  origins: string[],
  previous?: TripIntent,
  referencePrice?: number,
): TripIntent {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const i: TripIntent = previous ? structuredClone(previous) : baseIntent(today, origins);
  const notes: string[] = [];
  const has = (re: RegExp) => re.test(t);

  // ----- Timing -----
  const shift = t.match(/wait (?:another|an extra|one more|a|(\w+)) (week|month)s?/) ?? t.match(/(?:push|move) it (?:back )?(?:by )?(\w+)? ?(week|month)s?/);
  if (previous && shift) {
    const n = num(shift[1] ?? "1") ?? 1;
    const days = shift[2] === "month" ? 30 * n : 7 * n;
    i.earliestDeparture = addDays(i.earliestDeparture, days);
    i.latestDeparture = addDays(i.latestDeparture, days);
  } else {
    const within = t.match(/(?:next|within(?: the next)?|in the next|over the next) (\d+|a couple of|a couple|couple of|a few|few|two|three|four|five|six|a|one)? ?(day|week|month)s?/);
    if (has(/\bnext week off\b|\bhave next week\b|\boff next week\b/)) {
      const toMonday = ((8 - weekday(today)) % 7) || 7;
      const monday = addDays(today, toMonday);
      i.earliestDeparture = addDays(monday, -2);
      i.latestDeparture = addDays(monday, 1);
      i.tripNightsMin = 5;
      i.tripNightsMax = 8;
      notes.push("Trip fits around next week");
    } else if (has(/this weekend|next weekend|long weekend/)) {
      const toFriday = (5 - weekday(today) + 7) % 7 || 7;
      const friday = addDays(today, has(/next weekend/) ? toFriday + 7 : toFriday);
      i.earliestDeparture = addDays(friday, -1);
      i.latestDeparture = addDays(friday, has(/long weekend/) ? 14 : 1);
      i.tripNightsMin = 2;
      i.tripNightsMax = has(/long weekend/) ? 4 : 3;
    } else if (has(/(?<!the )next month/)) {
      const d = parseISO(today);
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
      i.earliestDeparture = first.toISOString().slice(0, 10);
      i.latestDeparture = last.toISOString().slice(0, 10);
    } else if (within) {
      const n = within[1] ? num(within[1]) ?? 1 : 1;
      const days = within[2] === "day" ? n : within[2] === "week" ? n * 7 : n * 30;
      i.earliestDeparture = addDays(today, Math.min(3, Math.max(1, Math.floor(days / 5))));
      i.latestDeparture = addDays(today, days);
    } else if (has(/\bsoon\b|asap|right away/)) {
      i.earliestDeparture = addDays(today, 2);
      i.latestDeparture = addDays(today, 21);
    }
  }

  // ----- Trip length -----
  const range = t.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(day|night)s?/);
  const single = t.match(/(\d+|a|one|two|three|ten|seven|five)[ -](day|night|week)s?\b(?! off)/);
  if (range) {
    const off = range[3] === "day" ? 1 : 0;
    i.tripNightsMin = Number(range[1]) - off;
    i.tripNightsMax = Number(range[2]) - off;
  } else if (has(/about a week|for a week|a week long|week-long|one week/)) {
    i.tripNightsMin = 6;
    i.tripNightsMax = 8;
  } else if (single && !/next|in|within|wait/.test(t.slice(Math.max(0, (single.index ?? 0) - 8), single.index ?? 0))) {
    const n = num(single[1]) ?? 1;
    if (single[2] === "week") {
      i.tripNightsMin = n * 7 - 1;
      i.tripNightsMax = n * 7 + 1;
    } else {
      const nights = single[2] === "day" ? n - 1 : n;
      i.tripNightsMin = Math.max(1, nights);
      i.tripNightsMax = nights + (previous ? 0 : 1);
    }
  }

  // ----- Budget & priorities -----
  const more = t.match(/(?:spend|pay)(?: up to)? \$?(\d[\d,]*) more/);
  if (more) {
    const extra = Number(more[1].replace(/,/g, ""));
    i.budgetMax = (i.budgetMax ?? referencePrice ?? 600) + extra;
    i.priceSensitivity = "low";
  } else {
    const budget = t.match(/(?:under|below|less than|max(?:imum)?|up to|budget(?: of| is)?|no more than|<)\s*\$?(\d[\d,]{1,5})/) ?? t.match(/\$(\d[\d,]{2,5})/);
    if (budget) i.budgetMax = Number(budget[1].replace(/,/g, ""));
  }
  if (has(/absolute cheapest|cheapest (?:thing|possible|option)|as cheap as possible|rock bottom/)) i.priceSensitivity = "extreme";
  else if (has(/\bcheap|budget|affordable|\bdeal|bargain|inexpensive/)) i.priceSensitivity = "high";
  if (has(/care less about price|don't mind paying|dont mind paying|worth paying|money is(?:n't| not) (?:an issue|a concern)|price doesn't matter/)) {
    i.priceSensitivity = "low";
    i.flightQualityImportance = "high";
  }
  if (has(/horrible flights|flight(?:s)? suck|sucking less|comfortable|good flights|easy flights|painless|short(?:er)? flights?/)) i.flightQualityImportance = "high";
  if (has(/\bonly nonstop|nonstop only|only direct|direct only|no (?:layovers|connections|stops)/)) {
    i.maxStops = 0;
    i.preferNonstop = true;
  } else if (has(/non-?stop|\bdirect\b/)) i.preferNonstop = true;
  if (has(/one stop max|at most one stop|max(?:imum)? one stop|1 stop max/)) i.maxStops = 1;
  if (has(/business class/)) i.cabin = "business";
  else if (has(/premium economy/)) i.cabin = "premium";
  else if (has(/first class/)) i.cabin = "first";

  // ----- Vibe -----
  if (has(/far away|\bfar\b|long[- ]haul|other side of the world|exotic|furthest|farthest/)) i.wantsFarAway = true;
  if (has(/international|abroad|outside (?:the )?(?:us|u\.s\.|states|country)|overseas|another country/)) i.scope = "international";
  else if (has(/domestic|within the (?:us|u\.s\.|states)|in the (?:us|states)/)) i.scope = "domestic";
  const interestWords: [RegExp, Interest[]][] = [
    [/tropical|island/, ["tropical", "beach"]],
    [/beach/, ["beach"]],
    [/nightlife|party|clubs|bars/, ["nightlife"]],
    [/\bcity|urban/, ["city"]],
    [/nature|hiking|mountains|outdoors|national park/, ["nature"]],
    [/\bfood|eat|culinary|restaurants/, ["food"]],
    [/culture|history|museum|architecture/, ["culture"]],
    [/adventure|adventurous/, ["adventure"]],
    [/\bski|snowboard/, ["ski"]],
    [/romantic|honeymoon|anniversary/, ["romantic"]],
  ];
  for (const [re, tags] of interestWords) if (re.test(t)) i.interests = [...new Set([...i.interests, ...tags])];
  if (has(/warm|sunny|hot\b|tropical|heat/)) i.weather = has(/hot\b/) ? "hot" : "warm";
  if (has(/cold|snow|winter wonderland/)) i.weather = "cold";
  if (has(/surprise me|awesome|cool|interesting|off the beaten|adventurous/)) i.adventurousness = "high";

  // ----- Places -----
  const negation = /(?:forget|not|no|except|skip|avoid|without|other than|anywhere but|besides)\s+(?:about\s+)?$/;
  const aliases = Object.keys(PLACE_ALIASES).sort((a, b) => b.length - a.length);
  let claimed = t;
  for (const alias of aliases) {
    const m = claimed.match(new RegExp(`(^|[^a-z])${escape(alias)}(?![a-z])`));
    if (!m || m.index === undefined) continue;
    const at = m.index + m[1].length;
    const before = claimed.slice(Math.max(0, at - 20), at);
    claimed = claimed.slice(0, at) + " ".repeat(alias.length) + claimed.slice(at + alias.length);
    const codes = PLACE_ALIASES[alias];
    const label = findDestination(codes[0])?.city && alias.length > 3 ? alias.replace(/\b\w/g, (c) => c.toUpperCase()) : alias.toUpperCase();
    if (negation.test(before)) {
      i.excludeDestinations = [...new Set([...i.excludeDestinations, ...codes, label])];
      if (i.destinationMode === "specific" && i.destinationAirports.some((c) => codes.includes(c))) {
        i.destinationMode = "anywhere";
        i.destinationAirports = [];
        i.destinationLabel = null;
      }
    } else if (i.destinationMode !== "specific" || !previous || !i.destinationAirports.some((c) => codes.includes(c))) {
      i.destinationMode = "specific";
      i.destinationAirports = codes;
      i.destinationLabel = label;
      i.regions = [];
    }
  }
  for (const [alias, regions] of Object.entries(REGION_ALIASES)) {
    if (!new RegExp(`\\b${escape(alias)}\\b`).test(claimed)) continue;
    const before = claimed.slice(0, claimed.search(new RegExp(`\\b${escape(alias)}\\b`)));
    if (negation.test(before.slice(-20))) continue;
    i.destinationMode = "region";
    i.regions = regions;
    i.destinationAirports = [];
    i.destinationLabel = regions.map((r) => REGION_LABELS[r]).join(" / ");
    if (i.scope === "domestic") i.scope = "any";
  }
  if (!previous && has(/surprise me|anywhere|somewhere|where should i go/) && i.destinationMode !== "specific" && !i.regions.length) {
    i.destinationMode = "anywhere";
  }

  // ----- Defaults & explanation -----
  if (!previous && !range && !single && !has(/about a week|for a week|one week|week off|weekend/)) {
    const shortHop = i.scope === "domestic";
    i.tripNightsMin = shortHop ? 3 : 5;
    i.tripNightsMax = shortHop ? 5 : 9;
    notes.push(`Assumed ${i.tripNightsMin}–${i.tripNightsMax} nights`);
  }
  if (i.tripNightsMin > i.tripNightsMax) [i.tripNightsMin, i.tripNightsMax] = [i.tripNightsMax, i.tripNightsMin];

  const where =
    i.destinationMode === "specific"
      ? i.destinationLabel ?? i.destinationAirports.join("/")
      : i.destinationMode === "region"
        ? i.destinationLabel ?? "the region"
        : i.scope === "international"
          ? "somewhere international"
          : "anywhere";
  const span = daysBetween(i.earliestDeparture, i.latestDeparture);
  i.summary = `${where[0].toUpperCase()}${where.slice(1)}, ${i.tripNightsMin}–${i.tripNightsMax} nights, leaving within a ${span + 1}-day window${i.budgetMax ? ` under $${i.budgetMax}` : ""}.`;
  i.assumptions = previous ? i.assumptions : [`Leaving from ${i.origins.join(", ")}`, ...notes, "Economy, 1 adult, round trip"];
  if (/one[- ]way|no return/.test(t)) {
    i.tripType = previous?.tripType === "multi_city" ? "multi_city" : "one_way";
    if (i.tripType === "multi_city") i.routeCandidates = i.routeCandidates?.map(c=>({...c,returnHome:false}));
  }
  if (/multi[- ]city|stopover|few days then|then.*(?:fly|go)|stop.*few days/.test(t)) i.tripType = "multi_city";
  if (/round[- ]trip only/.test(t)) i.tripType = "round_trip";
  if (i.tripType === "one_way") i.routeCandidates = i.destinationAirports.slice(0,3).map(airport => ({stops:[{airport,nights:0}],returnHome:false,reason:"Your requested destination."}));
  if (i.tripType === "multi_city" && !previous) {
    const matches = Object.entries(PLACE_ALIASES).map(([name,codes])=>({name,codes,at:t.indexOf(name)})).filter(x=>x.at>=0).sort((a,b)=>a.at-b.at);
    const codes = [...new Set(matches.map(x=>x.codes[0]))].filter(c=>!origins.includes(c)).slice(0,3);
    i.routeCandidates = codes.length >= 2 ? [{stops:codes.map(airport=>{
      const name = matches.find(m=>m.codes[0]===airport)!.name;
      const after = t.slice(t.indexOf(name)+name.length);
      const n = after.match(/^(?:\s|,|for|stay|about)*(\d+)\s*nights?/);
      return {airport,nights:n ? Number(n[1]) : 3};
    }),returnHome:! /one[- ]way|no return/.test(t),reason:"Requested cities; unspecified stays default to 3 nights."}] : [];
  }
  if (i.tripType === "multi_city" && previous) {
    for (const [name, codes] of Object.entries(PLACE_ALIASES)) {
      const n = t.match(new RegExp(`(\\d+) nights? in ${escape(name)}`)) ?? t.match(new RegExp(`${escape(name)} (?:for )?(\\d+) nights?`));
      if (n) i.routeCandidates = i.routeCandidates?.map(c=>({...c,stops:c.stops.map(s=>codes.includes(s.airport)?{...s,nights:Number(n[1])}:s)}));
    }
  }
  return i;
}
