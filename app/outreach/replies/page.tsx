import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { RepliesView } from "@/components/outreach/RepliesView";
import { getReplyThreads, getReplyThread, getThreadMessages } from "@/lib/outreach/replies/queries";

export const metadata = { title: "Replies | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const { thread: selectedEnrollmentId } = await searchParams;

  const threads = await getReplyThreads("all");

  const [selectedThread, threadMessages] = selectedEnrollmentId
    ? await Promise.all([getReplyThread(selectedEnrollmentId), getThreadMessages(selectedEnrollmentId)])
    : [null, []];

  return (
    <PageShell width="wide">
      <PageHeader
        title="Replies"
        description="Every reply your campaigns have received, across every mailbox. Sending stops for a contact the moment they reply — this is where you take it from here."
      />
      <RepliesView
        threads={threads}
        selectedEnrollmentId={selectedEnrollmentId ?? null}
        selectedThread={selectedThread}
        threadMessages={threadMessages}
      />
    </PageShell>
  );
}
