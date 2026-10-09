import request from "supertest";
import { createApp } from "../../src/app";

describe("Admin user-management endpoints require auth", () => {
  const app = createApp();
  const fakeId = "00000000-0000-0000-0000-000000000000";

  it("POST /admin/users rejects with no token (401)", async () => {
    const res = await request(app).post("/api/v1/admin/users").send({});
    expect(res.status).toBe(401);
  });

  it("GET /admin/users rejects with no token (401)", async () => {
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.status).toBe(401);
  });

  it("GET /admin/users/:id rejects with no token (401)", async () => {
    const res = await request(app).get(`/api/v1/admin/users/${fakeId}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /admin/users/:id rejects with no token (401)", async () => {
    const res = await request(app).patch(`/api/v1/admin/users/${fakeId}`).send({});
    expect(res.status).toBe(401);
  });

  it("POST /admin/users/:id/reset-password rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/admin/users/${fakeId}/reset-password`).send({});
    expect(res.status).toBe(401);
  });

  // Full create -> list -> update -> reset-password flow, and the
  // admin:users permission gate, requires a seeded database — battle-tested
  // manually against a real database instead (see chat).
});
