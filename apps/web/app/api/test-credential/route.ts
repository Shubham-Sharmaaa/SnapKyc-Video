import { Role } from "@repo/types";
import { NextRequest, NextResponse } from "next/server";
import { generateTestToken } from "../../_utils/utils";

type bodyType = {
  roomId: string;
  role: Role;
};

export async function POST(req: NextRequest) {
  // if (process.env.NODE_ENV !== "development") {
  //   return NextResponse.json({ message: "Not found" }, { status: 404 });
  // }
  let body: bodyType;
  try {
    body = await req.json();
  } catch (Err) {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 404 });
  }
  const { roomId, role } = body;
  if (!roomId || !role) {
    return NextResponse.json(
      { message: "give roomId and role " },
      { status: 404 },
    );
  }
  if (
    typeof roomId !== "string" ||
    roomId.trim() === "" ||
    roomId.length > 100 ||
    /\s/.test(roomId) ||
    (role !== "agent" && role !== "customer")
  ) {
    return NextResponse.json(
      { message: "Invalid roomId or role" },
      { status: 400 },
    );
  }
  const secret = process.env.secret;
  if (!secret)
    return NextResponse.json(
      {
        message: "secret configuration couldnt be accessed ",
      },
      { status: 404 },
    );
  const token = generateTestToken(roomId, role, secret);
  return NextResponse.json({ message: "here is the token", token });
}
