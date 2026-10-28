import nodemailer from "nodemailer";
import { createSmtpTransport } from "@/lib/outreach/transport/smtp";

jest.mock("nodemailer");

describe("createSmtpTransport", () => {
  const credentials = { host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p" };

  it("verifies the connection using nodemailer", async () => {
    const verify = jest.fn().mockResolvedValue(true);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ verify, sendMail: jest.fn() } as never);

    const transport = createSmtpTransport(credentials);
    await transport.verify();

    expect(verify).toHaveBeenCalled();
  });

  it("sends a message and returns the RFC message id", async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: "<abc@example.com>" });
    jest.mocked(nodemailer.createTransport).mockReturnValue({ verify: jest.fn(), sendMail } as never);

    const transport = createSmtpTransport(credentials);
    const result = await transport.send({
      to: "contact@acme.com",
      fromName: "Jane",
      fromEmail: "jane@example.com",
      subject: "Hi",
      text: "Hello there",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "contact@acme.com", subject: "Hi", text: "Hello there" }),
    );
    expect(result).toEqual({ rfcMessageId: "<abc@example.com>" });
  });
});
