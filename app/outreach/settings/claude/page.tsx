import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { siteUrl } from "@/lib/outreach/mailboxes/googleClient";
import { MCP_TOKEN_MIN_LENGTH, mcpEndpointUrl } from "@/lib/ai/mcpAuth";
import { CopyField } from "./CopyField";

export const metadata = { title: "Connect Claude | LeadFlow" };
export const dynamic = "force-dynamic";

const SCHEDULED_TASK_PROMPT = `Use the LeadFlow connector and follow its instructions. Call get_queue_status. First triage every waiting reply with list_replies_to_triage and triage_reply. Then draft icebreakers for up to 25 leads with list_leads_needing_icebreaker, get_lead_research and save_icebreaker_draft. When done, tell me which replies look interested, how many drafts you saved, and anything that looked off.`;

const sectionTitle = "mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted";

export default async function ConnectClaudePage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") redirect("/outreach/dashboard");

  const base = siteUrl();
  const endpoint = mcpEndpointUrl(base);
  const isLocal = /localhost|127\.0\.0\.1/.test(base);

  return (
    <PageShell>
      <PageHeader
        title="Connect Claude"
        description="Claude triages replies and drafts icebreakers and answers through LeadFlow's MCP connector, using your own Claude subscription. No API key is needed, and nothing Claude writes is sent until you approve it."
      />

      {!endpoint ? (
        <BlueprintCard>
          <h2 className={sectionTitle}>Turn on the connector</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>
              Generate a secret on the server:
              <pre className="mt-1 overflow-x-auto rounded-md bg-paper p-2 font-mono text-xs [font-variant-ligatures:none]">
                node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64url&apos;))&quot;
              </pre>
            </li>
            <li>
              Put it in <code>.env</code> as <code>MCP_ACCESS_TOKEN=...</code> (at least {MCP_TOKEN_MIN_LENGTH}{" "}
              characters) and restart the app.
            </li>
            <li>Come back to this page for the connector URL.</li>
          </ol>
        </BlueprintCard>
      ) : (
        <div className="flex flex-col gap-6">
          <BlueprintCard>
            <h2 className={sectionTitle}>Connector URL</h2>
            <CopyField value={endpoint} label="Connector URL" secret />
            <p className="mt-2 text-xs text-ink-faint">
              The secret in this URL is the only thing protecting the connector. Do not share it; to revoke it, change
              MCP_ACCESS_TOKEN and restart the app.
            </p>
            {isLocal && (
              <p className="mt-2 text-sm text-flag">
                This URL points at localhost, which only Claude Code on this machine can reach. Set
                NEXT_PUBLIC_SITE_URL to your public HTTPS address before connecting Claude on the web or desktop.
              </p>
            )}
          </BlueprintCard>

          <BlueprintCard>
            <h2 className={sectionTitle}>Claude (web, desktop, Cowork)</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
              <li>In Claude, open the connector settings and add a custom connector.</li>
              <li>Name it LeadFlow and paste the connector URL above. Leave authentication empty.</li>
              <li>In a Cowork task, ask Claude to draft icebreakers with the LeadFlow connector.</li>
            </ol>
            <p className="mt-3 text-sm text-ink-muted">
              To run it every morning, create a scheduled task in Cowork with this prompt:
            </p>
            <div className="mt-2">
              <CopyField value={SCHEDULED_TASK_PROMPT} label="Scheduled task prompt" multiline />
            </div>
          </BlueprintCard>

          <BlueprintCard>
            <h2 className={sectionTitle}>Claude Code</h2>
            <CopyField value={`claude mcp add --transport http leadflow ${endpoint}`} label="Claude Code command" secret />
          </BlueprintCard>
        </div>
      )}
    </PageShell>
  );
}
