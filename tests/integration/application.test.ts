import request from "supertest";
import { createApp } from "../../src/app";

describe("POST /api/v1/applications", () => {
  const app = createApp();

  it("rejects a request with no bearer token (401)", async () => {
    const res = await request(app).post("/api/v1/applications").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/applications", () => {
  const app = createApp();

  it("rejects a request with no bearer token (401)", async () => {
    const res = await request(app).get("/api/v1/applications");
    expect(res.status).toBe(401);
  });

  // Full create -> submit -> visibility-scoped list flow requires a seeded
  // test database — add once Prisma migrations run in CI.
});

describe("PATCH /api/v1/applications/:id", () => {
  const app = createApp();
  const fakeId = "00000000-0000-0000-0000-000000000000";

  it("rejects a request with no bearer token (401)", async () => {
    const res = await request(app).patch(`/api/v1/applications/${fakeId}`).send({ branch: "Main" });
    expect(res.status).toBe(401);
  });

  // Full DRAFT-only / creator-only / non-DRAFT-rejected flow requires a
  // seeded test database — battle-tested manually against a real database
  // instead (see chat).
});
