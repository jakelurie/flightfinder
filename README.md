# flightfinder

Describe a trip in plain English and get a real flight recommendation.

Type something like *"cheap warm beach trip in March, about a week"* or *"one way to Tokyo next month"* and flightfinder searches actual fares, ranks them for what you asked, and writes back a short recommendation with real prices and booking links. It runs on your own machine and is built for the phone.

## Running it

```bash
npm install
npm run build
npm start          # http://localhost:4340
```

You'll need two things installed:

- **Google Chrome** — flight prices are read from Google Flights using a local headless copy of Chrome. (No API key; you can set `FLIGHT_PROVIDER=demo` to try it with fake fares instead.)
- **A Claude subscription** — the recommendation is written by Claude through the [`claude` CLI](https://claude.com/claude-code). Sign in once by running `claude` in a terminal, and flightfinder uses that session. Alternatively set `ANTHROPIC_API_KEY` to use the paid API. With neither, it falls back to a plain rule-based write-up.

Set your home airports with `DEFAULT_ORIGINS=SFO,OAK,SJC`. Other optional settings are in `.env.local.example`.

## Notes

- A search takes about 30–60 seconds; recent searches are cached.
- One adult, prices in USD. The round-trip price is real, but you pick the return flight on the booking link.
- Google Flights has no official API and doesn't allow automated access, so keep this to personal, low-volume use.

## Harness startup

`npm run dev` and `npm start` both build and serve the production app on port 4340.
The server accepts connections only after the build finishes. This avoids the development
server's live-reload connection dependency when opening the app through the harness.
For code editing only, `npm run dev:hot` runs the development server on port 4341.
