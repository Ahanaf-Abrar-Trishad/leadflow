import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { BlueprintCard } from "@/components/outreach/BlueprintCard";
import { ImportLeadsForm } from "./ImportLeadsForm";

export const metadata = { title: "Import leads | LeadFlow" };

export default function ImportLeadsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Import leads"
        description="Upload a Scout export, a Google Maps scraper CSV, or any spreadsheet with business names, emails or websites. Duplicates merge into the leads you already have."
        back={{ href: "/outreach/leads", label: "Leads" }}
      />
      <BlueprintCard>
        <ImportLeadsForm />
      </BlueprintCard>
    </PageShell>
  );
}
