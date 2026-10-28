import { Barlow, Barlow_Condensed } from "next/font/google";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { RailNav } from "@/components/outreach/RailNav";
import { getWorkerHeartbeats } from "@/lib/outreach/dashboard/queries";
import { getUnhandledReplyCount } from "@/lib/outreach/replies/queries";
import "./outreach-theme.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export default async function OutreachLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // No user means login or first-run setup, which keep the suite's default
  // look (they already have their own bespoke card treatment) rather than
  // the console shell below.
  if (!user) return <>{children}</>;

  const [heartbeats, unreadReplies] = await Promise.all([getWorkerHeartbeats(), getUnhandledReplyCount()]);

  return (
    <div
      className={`outreach-theme ${barlow.variable} ${barlowCondensed.variable} flex min-h-dvh w-full bg-paper font-sans text-ink`}
    >
      <RailNav user={user} heartbeats={heartbeats} counts={{ unreadReplies }} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
