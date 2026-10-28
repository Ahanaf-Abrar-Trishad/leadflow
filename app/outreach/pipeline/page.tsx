import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { listDeals } from "@/lib/deals/deals";
import { DEAL_STAGES, STAGE_LABELS, isDealStage } from "@/lib/deals/stages";
import { DealCard } from "./DealCard";

export const metadata = { title: "Pipeline | LeadFlow" };
export const dynamic = "force-dynamic";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function PipelinePage() {
  const deals = await listDeals();
  const byStage = new Map(DEAL_STAGES.map((stage) => [stage, deals.filter((deal) => deal.stage === stage)]));
  const openValue = deals
    .filter((deal) => isDealStage(deal.stage) && deal.stage !== "won" && deal.stage !== "lost")
    .reduce((sum, deal) => sum + (deal.valueUsd ?? 0), 0);

  return (
    <PageShell width="wide">
      <PageHeader
        title="Pipeline"
        description={`Prospects who replied with interest, from first reply to a won client. ${usd.format(openValue)} open.`}
      />

      {deals.length === 0 ? (
        <EmptyState
          title="No deals yet"
          description="A contact lands here when Claude marks their reply interested, or when you add a reply thread to the pipeline."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {DEAL_STAGES.map((stage) => {
            const stageDeals = byStage.get(stage) ?? [];
            const total = stageDeals.reduce((sum, deal) => sum + (deal.valueUsd ?? 0), 0);
            return (
              <section key={stage} aria-labelledby={`stage-${stage}`} className="flex min-w-0 flex-col gap-2">
                <header className="flex items-baseline justify-between border-b border-border pb-1.5">
                  <h2 id={`stage-${stage}`} className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
                    {STAGE_LABELS[stage]} <span className="font-sans font-normal text-ink-faint">{stageDeals.length}</span>
                  </h2>
                  {total > 0 && <span className="font-mono text-xs text-ink-muted">{usd.format(total)}</span>}
                </header>
                {stageDeals.map((deal) => (
                  <DealCard key={deal.id} deal={{ ...deal, stageChangedAt: deal.stageChangedAt.toISOString() }} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
