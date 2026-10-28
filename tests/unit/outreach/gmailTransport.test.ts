/**
 * @jest-environment node
 */
// jsdom (this suite's default environment) doesn't provide Node's
// setImmediate global, which nodemailer's MailComposer/MimeNode needs while
// streaming a message to a buffer during send(). This is backend-only code
// with no DOM dependency, so it runs under the real node environment.
import { google } from "googleapis";
import { createGmailTransport } from "@/lib/outreach/transport/gmail";

// jest.mock() with a manual factory does not resolve "@/"-aliased module
// specifiers in this Next.js/Jest setup (a plain `import` of the same path
// resolves fine - only jest.mock()'s own resolution fails). Mocking the
// real "google-auth-library" package instead sidesteps that: gmail.ts's
// real createGoogleRefreshClient() runs unmocked, constructing a
// UserRefreshClient - which this mock intercepts - so the net effect is
// identical to mocking our own wrapper.
jest.mock("googleapis");
jest.mock("google-auth-library");

describe("createGmailTransport", () => {
  const credentials = { refreshToken: "1//test-refresh-token", email: "jane@gmail.com" };

  beforeEach(() => {
    // createGoogleRefreshClient() (unmocked - only the UserRefreshClient
    // class underneath it is mocked) reads these before constructing the
    // client, same as any other required-env-var check in this codebase.
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  it("verify() reads the connected profile", async () => {
    const getProfile = jest.fn().mockResolvedValue({ data: { emailAddress: "jane@gmail.com" } });
    jest.mocked(google.gmail).mockReturnValue({ users: { getProfile, messages: { send: jest.fn() } } } as never);

    await createGmailTransport(credentials).verify();

    expect(getProfile).toHaveBeenCalledWith({ userId: "me" });
  });

  it("send() composes a MIME message, sends it via the Gmail API, and returns matching IDs", async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: "18abc", threadId: "18abcthread" } });
    jest.mocked(google.gmail).mockReturnValue({ users: { getProfile: jest.fn(), messages: { send } } } as never);

    const result = await createGmailTransport(credentials).send({
      to: "contact@acme.com",
      fromName: "Jane",
      fromEmail: "jane@gmail.com",
      subject: "Hi",
      text: "Hello there",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0][0];
    expect(call.userId).toBe("me");
    expect(typeof call.requestBody.raw).toBe("string");
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: contact@acme.com");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("Hello there");
    expect(decoded).toMatch(/Message-ID: <.+>/i);

    expect(result.rfcMessageId).toMatch(/^<.+>$/);
    expect(result.providerThreadId).toBe("18abcthread");
  });

  it("send() passes threadId through when replying into an existing thread", async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: "18def", threadId: "18abcthread" } });
    jest.mocked(google.gmail).mockReturnValue({ users: { getProfile: jest.fn(), messages: { send } } } as never);

    await createGmailTransport(credentials).send({
      to: "contact@acme.com",
      fromName: "Jane",
      fromEmail: "jane@gmail.com",
      subject: "Re: Hi",
      text: "Following up",
      inReplyTo: "<first@gmail.com>",
      references: ["<first@gmail.com>"],
      threadId: "18abcthread",
    });

    expect(send.mock.calls[0][0].requestBody.threadId).toBe("18abcthread");
  });
});
