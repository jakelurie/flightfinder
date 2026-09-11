import { describe, expect, it } from "vitest";
import { buildTfs, cityFromTitle, parseExploreCard, parseFlight, toPlace } from "../providers/googleFlights";

// Row text and aria-labels captured from real Google Flights pages (Oct 2026 searches).
const q = { outboundDate: "2026-10-07", returnDate: "2026-10-15" };
const URL = "https://www.google.com/travel/flights/search?tfs=x";

describe("Google Flights tfs", () => {
  it("encodes the same search Google does", () => {
    const tfs = buildTfs({ mode: "flights", from: ["SFO", "OAK"].map(toPlace), to: ["HND", "NRT"].map(toPlace), outboundDate: "2026-10-06", returnDate: "2026-10-13", maxStops: 1, cabin: "economy" });
    expect(tfs).toBe("CBwQAhoyEgoyMDI2LTEwLTA2KAFqBwgBEgNTRk9qBwgBEgNPQUtyBwgBEgNITkRyBwgBEgNOUlQaMhIKMjAyNi0xMC0xMygBagcIARIDSE5EagcIARIDTlJUcgcIARIDU0ZPcgcIARIDT0FLQAFIAXABmAEB");
    expect(toPlace("/m/04jpl")).toEqual({ kind: 3, id: "/m/04jpl" });
  });
});

describe("Google Flights parsing", () => {
  it("parses a one-stop result", () => {
    const it0 = parseFlight(
      {
        text: "1:10 AM |  –  | 10:25 AM+1 | EVA Air | 19 hr 15 min | SFO–BKK | 1 stop | 1 hr 50 min TPE | 961 kg CO2e | Avg emissions | $902 | round trip",
        label:
          "From 902 US dollars round trip total. 1 stop flight with EVA Air. Leaves San Francisco International Airport at 1:10 AM on Wednesday, October 7 and arrives at Suvarnabhumi Airport at 10:25 AM on Thursday, October 8. Total duration 19 hr 15 min.  Layover (1 of 1) is a 1 hr 50 min layover at Taiwan Taoyuan International Airport in Taipei City. Select flight",
      },
      q,
      "Bangkok",
      URL,
    );
    expect(it0).toMatchObject({ source: "google", price: 902, origin: "SFO", destination: "BKK", destinationCity: "Bangkok", nights: 8, bookingUrl: URL });
    expect(it0!.outbound).toMatchObject({
      stops: 1,
      durationMin: 1155,
      airlines: ["EVA Air"],
      departTime: "2026-10-07 01:10",
      arriveTime: "2026-10-08 10:25",
      layovers: [{ airport: "TPE", durationMin: 110, overnight: false }],
    });
  });

  it("parses two stops, several airlines and a comma price", () => {
    const it0 = parseFlight(
      {
        text: "5:30 AM |  –  | 8:35 AM+1 | American, British Airways | 19 hr 5 min | SFO–LGW | 2 stops | DFW, TPA | 917 kg CO2e | +56% emissions | $1,712 | round trip",
        label:
          "From 1712 US dollars round trip total. 2 stops flight with American and British Airways. Leaves San Francisco International Airport at 5:30 AM on Wednesday, October 7 and arrives at London Gatwick Airport at 8:35 AM on Thursday, October 8. Total duration 19 hr 5 min.  Layover (1 of 2) is a 1 hr 35 min layover at Dallas Fort Worth International Airport in Dallas. Layover (2 of 2) is a 2 hr 39 min overnight layover at Tampa International Airport in Tampa. Select flight",
      },
      q,
      "London",
      URL,
    );
    expect(it0!.price).toBe(1712);
    expect(it0!.destinationCity).toBe("London");
    expect(it0!.outbound.airlines).toEqual(["American", "British Airways"]);
    expect(it0!.outbound.layovers).toEqual([
      { airport: "DFW", durationMin: 95, overnight: false },
      { airport: "TPA", durationMin: 159, overnight: true },
    ]);
  });

  it("handles nonstop rows and page titles", () => {
    const it0 = parseFlight(
      {
        text: "4:45 PM |  –  | 8:00 PM+1 | ZIPAIR Tokyo | 11 hr 15 min | SFO–NRT | Nonstop | 431 kg CO2e | -30% emissions | $888 | round trip",
        label: "From 888 US dollars round trip total. Nonstop flight with ZIPAIR Tokyo. Leaves San Francisco International Airport at 4:45 PM on Tuesday, October 6 and arrives at Narita International Airport at 8:00 PM on Wednesday, October 7. Total duration 11 hr 15 min.   Select flight",
      },
      { outboundDate: "2026-10-06", returnDate: "2026-10-13" },
      null,
      URL,
    );
    expect(it0).toMatchObject({ price: 888, destination: "NRT", destinationCity: "Tokyo" });
    expect(it0!.outbound).toMatchObject({ stops: 0, layovers: [], durationMin: 675, arriveTime: "2026-10-07 20:00" });
    expect(cityFromTitle("San Francisco and 1 more to Tokyo and 1 more | Google Flights")).toBe("Tokyo");
    expect(parseFlight({ text: "Price unavailable", label: "Select flight" }, q, null, URL)).toBeNull();
  });

  it("picks the right year across New Year", () => {
    const it0 = parseFlight(
      {
        text: "11:00 PM | – | 6:00 AM+2 | United | 15 hr | SFO–HND | Nonstop | $999",
        label: "From 999 US dollars round trip total. Nonstop flight with United. Leaves San Francisco International Airport at 11:00 PM on Thursday, December 31 and arrives at Haneda Airport at 6:00 AM on Saturday, January 2. Total duration 15 hr.",
      },
      { outboundDate: "2026-12-31", returnDate: "2027-01-08" },
      null,
      URL,
    );
    expect(it0!.outbound.arriveTime).toBe("2027-01-02 06:00");
  });

  it("parses Explore cards, matching known cities and keeping unknown ones by place id", () => {
    const eq = { origin: "SFO", outboundDate: "2026-10-07", returnDate: "2026-10-15", maxStops: null, cabin: "economy" as const };
    expect(parseExploreCard("/m/0dlv0", "New Delhi | $967 | 1 stop | 20 hr 55 min | $24", eq)).toMatchObject({ code: "DEL", city: "Delhi", price: 967, stops: 1, durationMin: 1255 });
    expect(parseExploreCard("/m/07dfk", "Edinburgh | $1,816 | 1 stop | 18 hr 10 min | $243", eq)).toMatchObject({ code: "/m/07dfk", city: "Edinburgh", country: "", price: 1816 });
    expect(parseExploreCard("/m/x", "Nowhere", eq)).toBeNull();
  });
});
