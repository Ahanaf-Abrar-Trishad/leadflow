import { ImapFlow } from "imapflow";
import { createImapClient } from "@/lib/outreach/transport/imap";

jest.mock("imapflow");

describe("createImapClient", () => {
  const credentials = { host: "imap.example.com", port: 993, secure: true, user: "u", pass: "p" };

  it("verify() connects and logs out", async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn().mockResolvedValue(undefined);
    jest.mocked(ImapFlow).mockImplementation(() => ({ connect, logout }) as never);

    await createImapClient(credentials).verify();

    expect(connect).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it("fetchSince() searches by date, fetches by UID, and maps to InboxMessage[]", async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn().mockResolvedValue(undefined);
    const release = jest.fn();
    const getMailboxLock = jest.fn().mockResolvedValue({ release });
    const search = jest.fn().mockResolvedValue([101, 102]);
    const fetchAll = jest.fn().mockResolvedValue([
      { envelope: { from: [{ address: "Reply@Example.com" }] }, source: Buffer.from("raw message one") },
      { envelope: { from: [{ address: "mailer-daemon@relay.example.com" }] }, source: Buffer.from("raw message two") },
    ]);
    jest.mocked(ImapFlow).mockImplementation(
      () => ({ connect, logout, getMailboxLock, search, fetchAll }) as never,
    );

    const since = new Date("2026-09-01T00:00:00Z");
    const result = await createImapClient(credentials).fetchSince(since);

    expect(search).toHaveBeenCalledWith({ since }, { uid: true });
    expect(fetchAll).toHaveBeenCalledWith([101, 102], { envelope: true, source: true }, { uid: true });
    expect(result).toEqual([
      { from: "reply@example.com", source: "raw message one" },
      { from: "mailer-daemon@relay.example.com", source: "raw message two" },
    ]);
    expect(release).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it("fetchSince() returns an empty array without fetching when nothing matches", async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn().mockResolvedValue(undefined);
    const release = jest.fn();
    const getMailboxLock = jest.fn().mockResolvedValue({ release });
    const search = jest.fn().mockResolvedValue([]);
    const fetchAll = jest.fn();
    jest.mocked(ImapFlow).mockImplementation(
      () => ({ connect, logout, getMailboxLock, search, fetchAll }) as never,
    );

    const result = await createImapClient(credentials).fetchSince(new Date());

    expect(result).toEqual([]);
    expect(fetchAll).not.toHaveBeenCalled();
  });
});
