import TripApp from "@/components/TripApp";

export default async function Page({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const params = await searchParams;
  return <TripApp initialQuery={typeof params.trip === "string" ? params.trip.slice(0, 1000) : ""} />;
}
