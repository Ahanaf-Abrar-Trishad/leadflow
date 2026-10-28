import { google } from "googleapis";
import { createGmailPollClient } from "@/lib/outreach/transport/gmailPoll";

// See gmailTransport.test.ts for why "google-auth-library" is mocked
// directly rather than our own googleClient.ts wrapper via an "@/"-aliased
// jest.mock() (that resolution path fails in this Next.js/Jest setup).
jest.mock("googleapis");
jest.mock("google-auth-library");

function rawMessageBase64(from: string, body: string): string {
  const raw = `From: ${from}\r\nTo: me@example.com\r\nSubject: Test\r\n\r\n${body}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

describe("createGmailPollClient", () => {
  const credentials = { refreshToken: "1//test", email: "jane@gmail.com" };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  it("fetchNew() with a known historyId uses history.list, filters to INBOX messagesAdded", async () => {
    const historyList = jest.fn().mockResolvedValue({
      data: {
        historyId: "9999",
        history: [
          { messagesAdded: [{ message: { id: "m1", labelIds: ["INBOX"] } }] },
          { messagesAdded: [{ message: { id: "m2", labelIds: ["SENT"] } }] }, // not INBOX - excluded
        ],
      },
    });
    const messagesGet = jest.fn().mockResolvedValue({
      data: { raw: rawMessageBase64("reply@example.com", "Sure, let's talk.") },
    });
    jest.mocked(google.gmail).mockReturnValue({
      users: { history: { list: historyList }, messages: { get: messagesGet }, getProfile: jest.fn() },
    } as never);

    const result = await createGmailPollClient(credentials).fetchNew("1234", new Date("2026-01-01"));

    expect(historyList).toHaveBeenCalledWith({ userId: "me", startHistoryId: "1234", historyTypes: ["messageAdded"] });
    expect(messagesGet).toHaveBeenCalledTimes(1);
    expect(messagesGet).toHaveBeenCalledWith({ userId: "me", id: "m1", format: "raw" });
    expect(result.newHistoryId).toBe("9999");
    expect(result.messages).toEqual([{ from: "reply@example.com", source: expect.stringContaining("Sure, let's talk.") }]);
  });

  it("fetchNew() with no historyId falls back to a date-filtered messages.list", async () => {
    const messagesList = jest.fn().mockResolvedValue({ data: { messages: [{ id: "m1" }] } });
    const messagesGet = jest.fn().mockResolvedValue({
      data: { raw: rawMessageBase64("reply@example.com", "Hello") },
    });
    const getProfile = jest.fn().mockResolvedValue({ data: { historyId: "5000" } });
    jest.mocked(google.gmail).mockReturnValue({
      users: { messages: { list: messagesList, get: messagesGet }, getProfile },
    } as never);

    const since = new Date("2026-01-01T00:00:00Z");
    const result = await createGmailPollClient(credentials).fetchNew(null, since);

    expect(messagesList).toHaveBeenCalledWith({
      userId: "me",
      labelIds: ["INBOX"],
      q: `after:${Math.floor(since.getTime() / 1000)}`,
    });
    expect(result.newHistoryId).toBe("5000");
    expect(result.messages).toHaveLength(1);
  });

  it("fetchNew() falls back to the date-filtered path when history.list 404s (outside retention window)", async () => {
    const notFound = Object.assign(new Error("Not Found"), { code: 404 });
    const historyList = jest.fn().mockRejectedValue(notFound);
    const messagesList = jest.fn().mockResolvedValue({ data: { messages: [] } });
    const getProfile = jest.fn().mockResolvedValue({ data: { historyId: "6000" } });
    jest.mocked(google.gmail).mockReturnValue({
      users: { history: { list: historyList }, messages: { list: messagesList, get: jest.fn() }, getProfile },
    } as never);

    const result = await createGmailPollClient(credentials).fetchNew("old-history-id", new Date("2026-01-01"));

    expect(messagesList).toHaveBeenCalled();
    expect(result.newHistoryId).toBe("6000");
  });
});
