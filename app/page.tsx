import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/app/app-shell";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell
      currentUser={{
        id: user.id,
        orgId: user.orgId,
        name: user.name,
        email: user.email,
        role: user.role as "owner" | "manager" | "employee",
        occupation: user.occupation,
        phone: user.phone,
        color: user.color,
        homeLocationId: user.homeLocationId,
        currentLocationId: user.currentLocationId,
      }}
    />
  );
}
