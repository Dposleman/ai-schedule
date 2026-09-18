import { NextResponse } from "next/server";
import { requireUser, withRoute } from "@/lib/api";

// Used by the mobile app to check for an existing session on launch and to
// fetch the signed-in user after a successful login. The web app doesn't
// need this — app/page.tsx reads the session server-side instead — but it
// costs nothing to share.
export const GET = withRoute(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  return NextResponse.json({
    user: {
      id: user.id,
      orgId: user.orgId,
      name: user.name,
      email: user.email,
      role: user.role,
      occupation: user.occupation,
      phone: user.phone,
      color: user.color,
      homeLocationId: user.homeLocationId,
      currentLocationId: user.currentLocationId,
      language: (user.language as "en" | "da") ?? "en",
    },
  });
});
