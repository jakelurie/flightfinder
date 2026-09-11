# flightfinder

A mobile-first, local web app: describe a trip in plain English, get a real recommendation.

```
natural language → Claude interprets → structured trip intent
  → broad search (destinations / dates) → narrow (best candidates) → refine (dates, lengths, airports, nonstop)
  → normalize → rank (weights adapt to the request) → computed date insights
  → Claude writes the recommendation over real results → mobile results page → follow-ups
```

Prices, schedules, durations and airlines come only from the flight provider. The AI writes
about them; a guard rejects any analysis that mentions a dollar figure not present in the results.

## Run it

```bash
npm install
npm run build
npm start                          # http://0.0.0.0:4340
```

No API keys needed. Optional settings live in `.env.local` (see `.env.local.example`).

- **Flight data:** real fares read from Google Flights and Google Travel Explore by a local headless
  Google Chrome (`src/lib/providers/googleFlights.ts`). Needs Google Chrome installed.
  `FLIGHT_PROVIDER=demo` switches to simulated fares; `serpapi` + `SERPAPI_API_KEY` is also supported.
- **AI:** the logged-in `claude` CLI in headless print mode, so it runs on your Claude subscription
  (Opus by default; `CLAUDE_MODEL=sonnet` is faster). If you're not logged in, run `claude` once in a
  terminal. `ANTHROPIC_API_KEY` is used instead if set. Without either, a rule-based fallback runs.
- **Home airports:** `DEFAULT_ORIGINS=SFO,OAK,SJC`.

For development with hot reload: `npm run dev` (same host/port).

Checks: `npm run check` (typecheck + lint + tests). `node scripts/screenshots.mjs` drives the
running app in a mobile viewport with local Chrome and saves screenshots to `.logs/shots/`.

## Open it from your phone (Tailscale)

The server listens on `0.0.0.0:4340`. With Tailscale running on the laptop and the phone:

- **Direct:** `http://<laptop-tailscale-ip>:4340` (find the IP with `tailscale ip -4`).
- **HTTPS via Serve (tailnet-only, never public):**
  `tailscale serve --bg --https=8445 http://127.0.0.1:4340` → `https://<machine>.<tailnet>.ts.net:8445`

Do **not** use `tailscale funnel`, since that would put it on the public internet. Binding to `0.0.0.0` also
makes it reachable on your local Wi-Fi; if you don't want that, block port 4340 in the macOS firewall
and use the Serve URL.

## Cost and limits

An analysis takes about 30–60 seconds: ~15–25 Google page loads (3 at a time) plus two Claude calls.
Repeats within 6 hours come from `.cache/`. Google doesn't offer Flights as an API and its terms don't
allow automated access, so keep it to personal, low-volume use: `SEARCH_MAX_PROVIDER_CALLS` caps searches per
analysis, and if Google shows a CAPTCHA the app pauses browser searches for 15 minutes and says so.
Google may change its page layout; the parser lives in `googleFlights.ts` and is covered by
`src/lib/__tests__/google.test.ts` using real captured page text.

## Code map

| Path | What |
|---|---|
| `src/lib/providers/types.ts` | **The flight-data integration point** (`FlightProvider`: `explore`, `searchFlights`). |
| `src/lib/providers/googleFlights.ts` | Default provider: headless Chrome on Google Flights / Explore, `tfs` URL builder, result parsing. |
| `src/lib/providers/serpapi.ts` | Optional SerpApi provider. |
| `src/lib/providers/mock.ts` | Deterministic demo fares, tagged `source: "demo"`. |
| `src/lib/llm.ts` | Claude via the `claude` CLI (subscription) or API key. |
| `src/lib/interpret.ts`, `heuristic.ts` | NL → `TripIntent` (Claude, with rule-based fallback), follow-up modification, validation/repair. |
| `src/lib/search.ts` | Search planner: fixed destination → date sweep + refinement; open destination → explore → top candidates → refinement. Cache, call budget, concurrency. |
| `src/lib/rank.ts` | Scoring with request-dependent weights, categories, destination cards. |
| `src/lib/insights.ts` | Week buckets, date strip and savings statements, all computed from results. |
| `src/lib/analyze.ts` | Final Claude pass + dollar-amount grounding check + rule-based fallback. |
| `src/lib/pipeline.ts`, `src/app/api/trip/route.ts` | Orchestration; streams NDJSON progress events to the UI. |
| `src/components/` | Mobile UI (home, live progress, results, date intelligence, follow-up bar, detail sheet). |

## Limitations

- Round-trip price is real, but only the **outbound** leg's details are shown; you choose the return
  flight when you open the search in Google Flights.
- One adult, prices in USD. Round trips, one-way flights, and routes with 2–3 cities are supported. Hotels and ground transport are not priced.
- Explore coverage is whatever Google shows for your primary airport and the regions searched.

## One-way and multi-city routes

Try “One way to Tokyo next month” or “Suggest a Japan trip with an interesting stopover for a few days, then fly home, about 10 nights.” You can also specify “Tokyo 5 nights, Seoul 3 nights, then home.” Follow-ups modify cities, stays, dates, and flight limits.

Claude proposes up to three routes. The route service (`src/lib/journeys.ts`) compares up to three departure dates per route, within the shared request cap. Each leg is searched as an actual one-way fare. Visits are scheduled from the actual local arrival date, not the previous flight's departure date. A route is displayed only when all legs are priced and its total meets the budget. The interface shows each stay, each flight, the exact sum of airfare, and a same-date round-trip comparison when available.

These are separate-ticket combinations, not airline stopover packages or a single protected multi-city ticket. Hotel nights exclude time spent flying. Availability and baggage should be checked on each booking link before purchase. This is a bounded search, not an exhaustive guarantee of the cheapest possible route; it currently uses the primary origin and the airport specified for each stop.

Run `node scripts/journey-browser.mjs` against the running server to verify real one-way, multi-city, and follow-up searches in a mobile viewport. This performs real Google Flights searches and uses the configured AI.

## Connection recovery

Trip searches run on the local server independently of the browser connection. The phone polls for new progress and automatically reconnects after a network interruption. Reloading the same tab resumes the pending search without submitting duplicate flight searches. Completed jobs remain available for two hours while the server is running. Restarting the server interrupts pending work; the phone then explains that a new search is needed. Explicitly cancelling leaves the bounded server search to finish, but detaches the tab from it.

`node scripts/reconnect-browser.mjs` verifies offline/reload recovery using the Richmond–Norway–Galápagos request and real provider searches.
