import { LoaderCircle } from "lucide-react";

// A shared fallback for any route segment that suspends while loading — used
// automatically by Next.js, no wiring needed at call sites.
export default function Loading() {
  return (
    <main className="auth-shell">
      <LoaderCircle className="spin" size={28} color="var(--accent)" />
    </main>
  );
}
