import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTasks } from "@/lib/onboarding/onboarding";

const schema = z.object({
  tasks: z.array(z.object({ label: z.string().trim().min(1).max(200), done: z.boolean() })).max(40),
});

export async function PUT(request: Request, ctx: RouteContext<"/api/outreach/onboardings/[id]/tasks">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  await updateTasks(id, parsed.data.tasks);
  return NextResponse.json({ saved: true });
}
