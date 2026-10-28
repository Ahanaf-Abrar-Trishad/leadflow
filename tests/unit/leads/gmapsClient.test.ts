/** @jest-environment node */
import { GmapsClient } from "@/lib/leads/gmaps/client";

describe("GmapsClient", () => {
  it("sends the fields the engine requires, with lat/lon as strings and max_time in seconds", async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ id: "job-1" }), { status: 201 }));
    const client = new GmapsClient("http://engine:8080/", fetchImpl);

    const id = await client.createJob({ keyword: "dentists in Austin, TX", lat: "30.26", lon: "-97.74", depth: 5, collectEmails: true, maxTimeSeconds: 480 });

    expect(id).toBe("job-1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://engine:8080/api/v1/jobs");
    expect(JSON.parse(init.body as string)).toMatchObject({
      keywords: ["dentists in Austin, TX"],
      lat: "30.26",
      lon: "-97.74",
      depth: 5,
      email: true,
      max_time: 480,
    });
  });

  it("reads the engine's capitalized Status field", async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ Status: "ok" })));
    expect(await new GmapsClient("http://engine:8080", fetchImpl).getStatus("job-1")).toBe("ok");
  });

  it("surfaces the engine's rejection reason", async () => {
    const fetchImpl = jest.fn(async () => new Response("missing max time", { status: 422 }));
    await expect(
      new GmapsClient("http://engine:8080", fetchImpl).createJob({ keyword: "x", lat: "1", lon: "1", depth: 1, collectEmails: false, maxTimeSeconds: 1 }),
    ).rejects.toThrow(/422.*missing max time/);
  });
});
