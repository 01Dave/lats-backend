import request from "supertest";
import { createApp } from "../../src/app";

describe("POST /api/v1/auth/login", () => {
  const app = createApp();

  it("rejects a request with no email or password (422)", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid email format (422)", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email", password: "x" });
    expect(res.status).toBe(422);
  });

  // Full login-success test requires a seeded test database —
  // add once Prisma migrations run in CI (see .github/workflows/ci.yml).
});

describe("GET /api/v1/auth/me", () => {
  const app = createApp();

  it("rejects a request with no bearer token (401)", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });
});
