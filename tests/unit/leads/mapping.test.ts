import { detectFormat, mapGenericRow, genericColumns, mapGmapsRow, mapRows, mapScoutRow } from "@/lib/leads/mapping";

describe("detectFormat", () => {
  it("recognizes the Maps engine CSV, a Scout CSV, and anything else", () => {
    expect(detectFormat(["input_id", "link", "title", "category", "place_id", "review_rating"])).toBe("gmaps");
    expect(detectFormat(["platform", "username", "full_name", "bio", "email"])).toBe("scout");
    expect(detectFormat(["Company Name", "Email", "Website"])).toBe("generic");
  });
});

describe("mapGmapsRow", () => {
  it("maps the engine's columns and cleans the email cell", () => {
    const lead = mapGmapsRow({
      title: "Bright Smile Dental",
      category: "Dentist",
      address: "100 Congress Ave, Austin, TX",
      website: "brightsmile.com",
      phone: "+1 512-555-0101",
      emails: "Hello@BrightSmile.com, office@brightsmile.com",
      review_rating: "4.1",
      review_count: "87",
      timezone: "America/Chicago",
      place_id: "ChIJ123",
      instagram: "https://instagram.com/brightsmile",
      facebook: "javascript:alert(1)",
    });
    expect(lead).toMatchObject({
      name: "Bright Smile Dental",
      externalId: "ChIJ123",
      email: "hello@brightsmile.com",
      emailSource: "maps",
      website: "https://brightsmile.com/",
      rating: 4.1,
      reviewCount: 87,
      timezone: "America/Chicago",
      socials: { instagram: "https://instagram.com/brightsmile" },
    });
  });

  it("returns null for a row without a business name", () => {
    expect(mapGmapsRow({ title: "  ", phone: "1" })).toBeNull();
  });
});

describe("mapScoutRow", () => {
  it("maps profile fields and keeps where the email came from", () => {
    const lead = mapScoutRow({
      platform: "instagram",
      username: "GlowStudio",
      full_name: "Glow Studio",
      email: "book@glowstudio.co",
      email_source: "website",
      external_url: "https://glowstudio.co",
      profile_url: "https://instagram.com/glowstudio",
      follower_count: "12.4K",
    });
    expect(lead).toMatchObject({
      name: "Glow Studio",
      externalId: "instagram:glowstudio",
      email: "book@glowstudio.co",
      emailSource: "scout:website",
      website: "https://glowstudio.co/",
      followers: 12400,
    });
  });
});

describe("mapGenericRow", () => {
  it("uses the company as the lead name and keeps the person as the contact", () => {
    const headers = ["First Name", "Last Name", "Company Name", "Work Email", "Website"];
    const lead = mapGenericRow(
      { "First Name": "Sam", "Last Name": "Lee", "Company Name": "Lee Roofing", "Work Email": "sam@leeroofing.com", Website: "leeroofing.com" },
      genericColumns(headers),
    );
    expect(lead).toMatchObject({ name: "Lee Roofing", contactName: "Sam Lee", email: "sam@leeroofing.com", emailSource: "csv" });
  });
});

describe("mapRows", () => {
  it("skips rows with no way to reach the business", () => {
    const { leads, skipped } = mapRows("gmaps", ["title"], [
      { title: "Reachable", phone: "1" },
      { title: "Unreachable" },
      { title: "" },
    ]);
    expect(leads.map((lead) => lead.name)).toEqual(["Reachable"]);
    expect(skipped).toBe(2);
  });
});
