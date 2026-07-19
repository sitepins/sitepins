import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Sitepins service is healthy" },
    { status: 200 },
  );
}
