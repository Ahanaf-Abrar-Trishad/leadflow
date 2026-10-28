import { redirect } from "next/navigation";

// LeadFlow has no public marketing page - the console is the app. The
// proxy sends a logged-out visitor on to /outreach/login from here.
export default function Home() {
  redirect("/outreach/dashboard");
}
