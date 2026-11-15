import { NextResponse } from "next/server";

export function GET() {
  const response = NextResponse.redirect("https://lunawindow-gameover.vercel.app/?direct=1", 303);
  response.cookies.set("moonsight_direct", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 86_400,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
