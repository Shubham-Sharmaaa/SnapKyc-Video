import { NextResponse } from "next/server";

export async function GET() {
  const domain = process.env.METERED_DOMAIN;
  const apiKey = process.env.METERED_TURN_API_KEY;

  if (!domain || !apiKey) {
    return NextResponse.json(
      { error: "TURN configuration missing" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("TURN provider request failed");
    }

    const iceServers = await response.json();

    return NextResponse.json(iceServers, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load TURN servers" },
      { status: 502 },
    );
  }
}
