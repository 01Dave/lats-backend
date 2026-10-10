import { isOriginAllowed } from "../../src/config/cors";

describe("isOriginAllowed", () => {
  it("allows any origin when the allowed list is '*' (the default)", () => {
    expect(isOriginAllowed("https://anything.example.com", ["*"])).toBe(true);
    expect(isOriginAllowed(undefined, ["*"])).toBe(true);
  });

  it("allows requests with no Origin header regardless of the list", () => {
    // Same-origin requests, server-to-server calls, curl/Postman — never
    // a cross-origin browser request, so CORS doesn't apply to them.
    expect(isOriginAllowed(undefined, ["https://lats.example.com"])).toBe(true);
  });

  it("allows an origin that's in the explicit list", () => {
    expect(isOriginAllowed("https://lats.example.com", ["https://lats.example.com", "https://staging.example.com"])).toBe(
      true,
    );
  });

  it("rejects an origin that's not in the explicit list", () => {
    expect(isOriginAllowed("https://evil.example.com", ["https://lats.example.com"])).toBe(false);
  });

  it("is an exact match, not a substring/prefix match", () => {
    expect(isOriginAllowed("https://lats.example.com.evil.com", ["https://lats.example.com"])).toBe(false);
  });
});
