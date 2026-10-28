import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { invoices, onboardings } from "@/db/schema";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { Table, Th, Td, Tr } from "@/components/outreach/Table";
import { EmptyState } from "@/components/shared/EmptyState";
import { listClients } from "@/lib/deals/deals";
import { formatCents } from "@/lib/billing/money";

export const metadata = { title: "Clients | LeadFlow" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClients();
  const ids = clients.map((client) => client.id);
  const [allInvoices, allOnboardings] = ids.length
    ? await Promise.all([
        db.select().from(invoices).where(inArray(invoices.dealId, ids)),
        db.select().from(onboardings).where(inArray(onboardings.dealId, ids)),
      ])
    : [[], []];

  return (
    <PageShell width="wide">
      <PageHeader title="Clients" description="Won deals: what they owe, what they paid, and how onboarding is going." />
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" description="A deal becomes a client when its proposal is signed or you move it to Won." />
      ) : (
        <BlueprintCard noPadding className="overflow-x-auto">
          <Table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Open</Th>
                <Th>Onboarding</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const clientInvoices = allInvoices.filter((invoice) => invoice.dealId === client.id);
                const paid = clientInvoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amountCents, 0);
                const open = clientInvoices
                  .filter((i) => i.status === "open" || i.status === "processing")
                  .reduce((sum, i) => sum + i.amountCents, 0);
                const onboarding = allOnboardings.find((o) => o.dealId === client.id);
                const doneCount = onboarding?.tasks.filter((task) => task.done).length ?? 0;
                return (
                  <Tr key={client.id}>
                    <Td>
                      <Link href={`/outreach/clients/${client.id}`} className="font-medium text-ink hover:underline">
                        {client.title}
                      </Link>
                      <p className="text-xs text-ink-faint">{client.contactEmail}</p>
                    </Td>
                    <Td align="right" numeric>
                      {paid ? formatCents(paid) : "-"}
                    </Td>
                    <Td align="right" numeric className={open ? "font-semibold text-ink" : "text-ink-muted"}>
                      {open ? formatCents(open) : "-"}
                    </Td>
                    <Td className="text-ink-muted">
                      {onboarding
                        ? `${doneCount}/${onboarding.tasks.length} done${onboarding.intakeSubmittedAt ? " · intake in" : ""}`
                        : "Starts at first payment"}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </BlueprintCard>
      )}
    </PageShell>
  );
}
