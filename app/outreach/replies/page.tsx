import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { RepliesView } from "@/components/outreach/RepliesView";
import { getReplyThreads, getReplyThread, getThreadMessages } from "@/lib/outreach/replies/queries";
import { getPendingReplyDraft } from "@/lib/ai/replies";
import { getDealForEnrollment } from "@/lib/deals/deals";

export const metadata = { title: "Replies | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const { thread: selectedEnrollmentId } = await searchParams;

  const threads = await getReplyThreads("all");

  const validId = selectedEnrollmentId && /^[0-9a-f-]{36}$/i.test(selectedEnrollmentId) ? selectedEnrollmentId : null;
  const [selectedThread, threadMessages, replyDraft, deal] = validId
    ? await Promise.all([
        getReplyThread(validId),
        getThreadMessages(validId),
        getPendingReplyDraft(validId),
        getDealForEnrollment(validId),
      ])
    : [null, [], null, null];

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
        replyDraft={replyDraft}
        deal={deal}
      />
    </PageShell>
  );
}
