import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";
import { createMailboxSchema } from "@/lib/outreach/mailboxes/validation";
import { assertPublicSmtpHost, assertPublicImapHost } from "@/lib/outreach/mailboxes/hostGuard";
import { encrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { createSmtpTransport } from "@/lib/outreach/transport/smtp";
import { createImapClient } from "@/lib/outreach/transport/imap";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createMailboxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  // SSRF guard: refuse to open an outbound connection to a private, loopback,
  // link-local, or otherwise non-public address (e.g. cloud metadata) before
  // ever touching the network with attacker-supplied host/port.
  try {
    await assertPublicSmtpHost(input.smtp.host, input.smtp.port);
    await assertPublicImapHost(input.imap.host, input.imap.port);
  } catch (error) {
    return NextResponse.json(
      { error: { formErrors: [error instanceof Error ? error.message : "Invalid host."] } },
      { status: 422 },
    );
  }

  const transport = createSmtpTransport(input.smtp);
  const imapClient = createImapClient({ ...input.imap, user: input.smtp.user, pass: input.smtp.pass });
  try {
    await transport.verify();
    await imapClient.verify();
  } catch {
    return NextResponse.json(
      { error: { formErrors: ["Could not verify SMTP/IMAP connection with these credentials."] } },
      { status: 422 },
    );
  }

  const key = loadEncryptionKey();
  const encryptedCredentials = encrypt(
    JSON.stringify({
      smtp: input.smtp,
      imap: { ...input.imap, user: input.smtp.user, pass: input.smtp.pass },
    }),
    key,
  );

  const [mailbox] = await db
    .insert(mailboxes)
    .values({
      provider: "smtp",
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      encryptedCredentials,
      dailyCap: input.dailyCap,
      rampStartedAt: new Date(),
    })
    .returning({
      id: mailboxes.id,
      fromName: mailboxes.fromName,
      fromEmail: mailboxes.fromEmail,
      dailyCap: mailboxes.dailyCap,
    });

  return NextResponse.json({ mailbox }, { status: 201 });
}

export async function GET() {
  const rows = await db
    .select({
      id: mailboxes.id,
      fromName: mailboxes.fromName,
      fromEmail: mailboxes.fromEmail,
      dailyCap: mailboxes.dailyCap,
      health: mailboxes.health,
    })
    .from(mailboxes);
  return NextResponse.json({ mailboxes: rows });
}
