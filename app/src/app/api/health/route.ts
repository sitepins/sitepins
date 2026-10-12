import { BRAND_NAME } from "@/lib/brand";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: `${BRAND_NAME} service is healthy` },
    { status: 200 },
  );
}
