import { defaultOrigins } from "@/lib/interpret";
import { hasLLM, llmLabel } from "@/lib/llm";
import { getProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getProvider();
  return Response.json({
    ai: hasLLM(),
    model: llmLabel(),
    demo: provider.demo,
    provider: provider.name,
    origins: defaultOrigins(),
  });
}
