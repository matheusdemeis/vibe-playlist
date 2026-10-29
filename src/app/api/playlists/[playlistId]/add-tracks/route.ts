import { NextRequest, NextResponse } from "next/server";
import { POST as savePlaylist } from "../../../vibe/save/route";

// Kept as a compatibility route. Insertion recovery must carry the signed draft receipt.
export async function POST(request: NextRequest, context: { params: Promise<{ playlistId: string }> }) {
  const { playlistId } = await context.params;
  const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (!/^[A-Za-z0-9]{22}$/.test(playlistId) || !body || typeof body.recoveryToken !== "string") {
    return NextResponse.json({ error: { message: "Resume saving from the original VibePlay draft.", status: 400 }, code: "recovery_required" }, { status: 400 });
  }
  // The save handler verifies the signed playlist ID, owner, and immutable payload.
  return savePlaylist(request);
}
