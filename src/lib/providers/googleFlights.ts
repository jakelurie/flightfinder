import type { Browser, BrowserContext, Page } from "playwright-core";
import { daysBetween } from "../dates";
import { REGION_KGMID, distanceBetween, findDestination, findDestinationByName } from "../geo";
import type { Itinerary, Layover, TripIntent } from "../types";
import type { ExploreDestination, ExploreQuery, FlightProvider, FlightQuery, FlightSearchResult } from "./types";

// Real fares read straight from Google Flights / Google Travel Explore in a local headless Chrome.
// No API key. Google doesn't offer this as an API, so volume is kept low: search.ts caps calls per
// analysis, results are cached on disk, and a CAPTCHA pauses all browser searches for a while.

const MAX_PAGES = Number(process.env.GOOGLE_MAX_PAGES ?? 3);
const IDLE_CLOSE_MS = 3 * 60_000;
const BLOCK_PAUSE_MS = 15 * 60_000;
const PARAMS = "hl=en&gl=us&curr=USD";

// ---------- tfs URL parameter (a small protobuf Google Flights uses for search state) ----------

type Place = { kind: 1 | 3 | 4; id: string }; // 1 = airport code, 3 = city place id, 4 = region place id

const varint = (n: number): number[] => {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
  return out;
};
const field = (num: number, wire: 0 | 2) => varint((num << 3) | wire);
const int = (num: number, n: number) => [...field(num, 0), ...varint(n)];
const msg = (num: number, body: number[]) => [...field(num, 2), ...varint(body.length), ...body];
const str = (num: number, s: string) => msg(num, [...new TextEncoder().encode(s)]);

export const toPlace = (s: string): Place => (s.startsWith("/") ? { kind: 3, id: s } : { kind: 1, id: s.toUpperCase() });

function legBytes(date: string, from: Place[], to: Place[], maxStops: number | null): number[] {
  const b = str(2, date);
  if (maxStops !== null) b.push(...int(5, Math.min(3, Math.max(0, maxStops))));
  for (const p of from) b.push(...msg(13, [...int(1, p.kind), ...str(2, p.id)]));
  for (const p of to) b.push(...msg(14, [...int(1, p.kind), ...str(2, p.id)]));
  return b;
}

export function buildTfs(o: { mode: "flights" | "explore"; from: Place[]; to: Place[]; outboundDate: string; returnDate: string; oneWay?: boolean; maxStops: number | null; cabin: TripIntent["cabin"] }): string {
  const seat = { economy: 1, premium: 2, business: 3, first: 4 }[o.cabin];
  const bytes = [
    ...int(1, 28),
    ...int(2, o.mode === "flights" ? 2 : 3),
    ...msg(3, legBytes(o.outboundDate, o.from, o.to, o.maxStops)),
    ...(o.oneWay ? [] : msg(3, legBytes(o.returnDate, o.to, o.from, o.maxStops))),
    ...int(8, 1), // one adult
    ...int(9, seat),
    ...int(14, 1),
    ...int(19, o.oneWay ? 2 : 1), // trip type
  ];
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- Parsing (pure; unit-tested with real page text) ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SP = "[\\s\\u202f\\u00a0]";

function toMinutes(s: string | undefined): number {
  if (!s) return 0;
  const h = s.match(/(\d+)\s*hr/);
  const m = s.match(/(\d+)\s*min/);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/** "4:45 PM", "October 6" → "2026-10-06 16:45", picking the year closest to `anchor`. */
function toLocal(time: string, ampm: string, month: string, day: string, anchor: string): string {
  const [hh, mm] = time.split(":").map(Number);
  const h24 = (hh % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0);
  const mi = MONTHS.indexOf(month);
  const year = Number(anchor.slice(0, 4));
  const candidates = [year - 1, year, year + 1].map((y) => `${y}-${String(mi + 1).padStart(2, "0")}-${day.padStart(2, "0")}`);
  const date = candidates.sort((a, b) => Math.abs(daysBetween(anchor, a)) - Math.abs(daysBetween(anchor, b)))[0];
  return `${date} ${String(h24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export interface RawFlight {
  label: string; // the result row's aria-label
  text: string; // the row's visible text, segments joined with " | "
}

export function parseFlight(raw: RawFlight, q: { outboundDate: string; returnDate: string; oneWay?: boolean }, destCity: string | null, url: string): Itinerary | null {
  const { label, text } = raw;
  const price = label.match(/From ([\d,]+) US dollars/);
  const head = label.match(/(Nonstop|(\d+) stops?) flight with (.+?)\.\s+Leaves/);
  const times = label.match(
    new RegExp(`Leaves .+? at (\\d{1,2}:\\d{2})${SP}*(AM|PM) on \\w+, (\\w+) (\\d{1,2}) and arrives at .+? at (\\d{1,2}:\\d{2})${SP}*(AM|PM) on \\w+, (\\w+) (\\d{1,2})`),
  );
  const route = text.match(/\b([A-Z]{3})[–-]([A-Z]{3})\b/);
  if (!price || !head || !times || !route) return null;
  if (q.oneWay && /round trip/i.test(label)) return null;
  if (!q.oneWay && !/round trip/i.test(label)) return null;

  const stops = head[1] === "Nonstop" ? 0 : Number(head[2]);
  const airlines = head[3].split(/,\s*(?:and\s+)?|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  const segments = text.split("|").map((s) => s.trim());
  const stopsIdx = segments.findIndex((s) => /^(Nonstop|\d+ stops?)$/.test(s));
  const codes = stopsIdx >= 0 && stops > 0 ? (segments[stopsIdx + 1]?.match(/\b[A-Z]{3}\b/g) ?? []) : [];
  const layovers: Layover[] = [...label.matchAll(/Layover \(\d+ of \d+\) is a ([^.]*?) (overnight )?layover (?:at|in) ([^.]+?)\./g)].map((m, i) => ({
    airport: codes[i] ?? m[3].replace(/ International Airport.*| Airport.*/, ""),
    durationMin: toMinutes(m[1]),
    overnight: Boolean(m[2]),
  }));

  const [origin, destination] = [route[1], route[2]];
  const catalog = findDestination(destination);
  const departTime = toLocal(times[1], times[2], times[3], times[4], q.outboundDate);
  const arriveTime = toLocal(times[5], times[6], times[7], times[8], q.outboundDate);
  return {
    id: `gf-${origin}-${destination}-${q.outboundDate}-${q.returnDate}-${departTime.slice(11).replace(":", "")}-${airlines.join("_").replace(/\W+/g, "")}-${stops}`,
    source: "google",
    origin,
    destination,
    destinationCity: catalog?.city ?? destCity ?? destination,
    destinationCountry: catalog?.country ?? "",
    departDate: q.outboundDate,
    returnDate: q.returnDate,
    nights: daysBetween(q.outboundDate, q.returnDate),
    price: Number(price[1].replace(/,/g, "")),
    outbound: {
      departAirport: origin,
      arriveAirport: destination,
      departTime,
      arriveTime,
      durationMin: toMinutes(label.match(/Total duration ([^.]+)\./)?.[1]),
      stops,
      layovers,
      airlines,
      flightNumbers: [],
    },
    bookingUrl: url,
    distanceMiles: distanceBetween(origin, destination),
  };
}

/** "San Francisco and 1 more to Tokyo and 1 more | Google Flights" → "Tokyo" */
export function cityFromTitle(title: string): string | null {
  const m = title.match(/ to (.+?)(?: and \d+ more)? \|/);
  return m ? m[1] : null;
}

export function parseExploreCard(placeId: string, text: string, q: ExploreQuery): ExploreDestination | null {
  const segments = text.split("|").map((s) => s.trim()).filter(Boolean);
  const name = segments[0];
  const price = segments.find((s) => /^\$[\d,]+$/.test(s));
  if (!name || !price) return null;
  const stopsSeg = segments.find((s) => /^(Nonstop|\d+ stops?)$/.test(s));
  const durationSeg = segments.find((s) => /\d+ (hr|min)/.test(s));
  const catalog = findDestinationByName(name);
  return {
    code: catalog?.code ?? placeId,
    city: catalog?.city ?? name,
    country: catalog?.country ?? "",
    price: Number(price.slice(1).replace(/,/g, "")),
    departDate: q.outboundDate,
    returnDate: q.returnDate,
    stops: stopsSeg ? (stopsSeg === "Nonstop" ? 0 : parseInt(stopsSeg, 10)) : undefined,
    durationMin: durationSeg ? toMinutes(durationSeg) : undefined,
  };
}

// ---------- Browser management ----------

type Shared = { browser: Promise<Browser>; context: Promise<BrowserContext>; idle?: ReturnType<typeof setTimeout> };
const g = globalThis as typeof globalThis & { __gfShared?: Shared; __gfBlockedUntil?: number; __gfActive?: number; __gfQueue?: (() => void)[] };

function shared(): Shared {
  if (!g.__gfShared) {
    const browser = import("playwright-core").then(({ chromium }) =>
      chromium.launch({
        headless: true,
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.CHROME_CHANNEL || "chrome" }),
      }),
    );
    const context = browser.then(async (b) => {
      b.on("disconnected", () => (g.__gfShared = undefined));
      const ctx = await b.newContext({ locale: "en-US", timezoneId: "America/Los_Angeles", viewport: { width: 1280, height: 900 } });
      // Skip images and fonts: the data is in the HTML, and this roughly halves load time.
      await ctx.route("**/*", (r) => (["image", "font", "media"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
      return ctx;
    });
    g.__gfShared = { browser, context };
    browser.catch(() => (g.__gfShared = undefined));
  }
  return g.__gfShared;
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  if (g.__gfBlockedUntil && Date.now() < g.__gfBlockedUntil) {
    throw new Error("Google Flights is asking for a CAPTCHA, so browser searches are paused for a few minutes.");
  }
  g.__gfActive ??= 0;
  g.__gfQueue ??= [];
  if (g.__gfActive >= MAX_PAGES) await new Promise<void>((resolve) => g.__gfQueue!.push(resolve));
  g.__gfActive++;
  const s = shared();
  if (s.idle) clearTimeout(s.idle);
  let page: Page | undefined;
  try {
    let context: BrowserContext;
    try {
      context = await s.context;
    } catch (err) {
      throw new Error(`Couldn't start Chrome for Google Flights (${err instanceof Error ? err.message.split("\n")[0] : err}). Install Google Chrome or set CHROME_PATH.`);
    }
    page = await context.newPage();
    return await fn(page);
  } finally {
    await page?.close().catch(() => {});
    g.__gfActive--;
    g.__gfQueue.shift()?.();
    if (g.__gfActive === 0 && g.__gfShared === s) {
      s.idle = setTimeout(() => {
        g.__gfShared = undefined;
        s.browser.then((b) => b.close()).catch(() => {});
      }, IDLE_CLOSE_MS);
    }
  }
}

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (/\/sorry\/|consent\.google\./.test(page.url())) {
    g.__gfBlockedUntil = Date.now() + BLOCK_PAUSE_MS;
    throw new Error("Google Flights is asking for a CAPTCHA, so browser searches are paused for a few minutes.");
  }
}

/** Wait until `count()` stops growing (results stream in over a second or two). */
async function settle(page: Page, count: () => Promise<number>, maxMs = 4000) {
  let last = -1;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const n = await count();
    if (n > 0 && n === last) return;
    last = n;
    await page.waitForTimeout(450);
  }
}

// ---------- Provider ----------

export const googleFlightsProvider: FlightProvider = {
  name: "Google Flights",
  demo: false,

  async searchFlights(q: FlightQuery): Promise<FlightSearchResult> {
    const tfs = buildTfs({ mode: "flights", oneWay: q.oneWay, from: q.origins.map(toPlace), to: q.destinations.map(toPlace), outboundDate: q.outboundDate, returnDate: q.returnDate, maxStops: q.maxStops, cabin: q.cabin });
    const url = `https://www.google.com/travel/flights/search?tfs=${tfs}&${PARAMS}`;
    return withPage(async (page) => {
      await open(page, url);
      const rowSelector = 'li div[aria-label*="US dollars"]';
      await Promise.any([
        page.waitForSelector(rowSelector, { timeout: 25_000 }),
        page.waitForFunction(() => /No results returned|No flights match|no options matching/i.test(document.body.innerText), null, { timeout: 25_000 }),
      ]).catch(() => {});
      await settle(page, () => page.locator(rowSelector).count(), 2500);

      const { rows, title, level } = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("li")]
          .map((li) => ({ el: li.querySelector('div[aria-label*="US dollars"]'), li }))
          .filter((r) => r.el)
          .map((r) => ({ label: r.el!.getAttribute("aria-label") ?? "", text: r.li.innerText.replace(/\n+/g, " | ") }));
        const level = document.body.innerText.match(/Prices are currently (low|typical|high)/)?.[1];
        return { rows, title: document.title, level };
      });

      const seen = new Set<string>();
      const itineraries: Itinerary[] = [];
      for (const row of rows) {
        if (seen.has(row.label)) continue;
        seen.add(row.label);
        const it = parseFlight(row, q, cityFromTitle(title), url);
        if (it) itineraries.push({ ...it, priceLevel: level });
      }
      return { itineraries, priceLevel: level };
    });
  },

  async explore(q: ExploreQuery): Promise<ExploreDestination[]> {
    const area = q.region ? REGION_KGMID[q.region] : undefined;
    const tfs = buildTfs({ mode: "explore", from: [toPlace(q.origin)], to: area ? [{ kind: 4, id: area }] : [], outboundDate: q.outboundDate, returnDate: q.returnDate, maxStops: q.maxStops, cabin: q.cabin });
    return withPage(async (page) => {
      await open(page, `https://www.google.com/travel/explore?tfs=${tfs}&${PARAMS}`);
      await page.waitForSelector("li[data-code]", { timeout: 25_000 }).catch(() => {});
      await settle(page, () => page.locator("li[data-code]").count());
      const cards = await page.$$eval("li[data-code]", (els) => els.map((li) => ({ id: li.getAttribute("data-code") ?? "", text: (li as HTMLElement).innerText.replace(/\n+/g, " | ") })));
      return cards.map((c) => parseExploreCard(c.id, c.text, q)).filter((d): d is ExploreDestination => d !== null);
    });
  },
};
