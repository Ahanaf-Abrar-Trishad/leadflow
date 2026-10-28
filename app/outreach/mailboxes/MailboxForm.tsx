"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { Field } from "@/components/shared/Field";
import { useUIStore } from "@/store/uiStore";

export function MailboxForm() {
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [dailyCap, setDailyCap] = useState(15);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const showToast = useUIStore((state) => state.showToast);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/outreach/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "smtp",
          fromName,
          fromEmail,
          dailyCap,
          smtp: { host, port, secure, user, pass },
          imap: { host: imapHost, port: imapPort, secure: imapSecure },
        }),
      });
      const responseBody = await response.json();
      if (!response.ok) {
        showToast("error", responseBody.error?.formErrors?.[0] ?? "Could not connect to that mailbox.");
        return;
      }
      showToast("success", "Mailbox connected.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id="mailbox-from-name" label="From name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
      <Field id="mailbox-from-email" label="From email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
      <Field id="mailbox-smtp-host" label="SMTP host" value={host} onChange={(e) => setHost(e.target.value)} />
      <Field
        id="mailbox-smtp-port"
        label="SMTP port"
        type="number"
        value={port}
        onChange={(e) => setPort(Number(e.target.value))}
      />
      <Field id="mailbox-user" label="Username" value={user} onChange={(e) => setUser(e.target.value)} />
      <Field
        id="mailbox-pass"
        label="Password / app password"
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
      <Field
        id="mailbox-imap-host"
        label="IMAP host"
        hint="For reply detection."
        value={imapHost}
        onChange={(e) => setImapHost(e.target.value)}
      />
      <Field
        id="mailbox-imap-port"
        label="IMAP port"
        type="number"
        value={imapPort}
        onChange={(e) => setImapPort(Number(e.target.value))}
      />
      <Checkbox
        id="imap-secure"
        label="Use TLS for IMAP"
        checked={imapSecure}
        onChange={setImapSecure}
        className="sm:col-span-2"
      />
      <Field
        id="mailbox-daily-cap"
        label="Daily send cap"
        type="number"
        value={dailyCap}
        onChange={(e) => setDailyCap(Number(e.target.value))}
      />
      <Checkbox id="smtp-secure" label="Use TLS" checked={secure} onChange={setSecure} className="sm:col-span-2" />
      <Button
        className="sm:col-span-2"
        loading={loading}
        disabled={!fromName || !fromEmail || !host || !user || !pass || !imapHost}
        onClick={handleSubmit}
      >
        Connect mailbox
      </Button>
    </div>
  );
}
