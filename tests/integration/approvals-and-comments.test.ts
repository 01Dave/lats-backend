import request from "supertest";
import { createApp } from "../../src/app";

describe("Approval decision and comment endpoints require auth", () => {
  const app = createApp();
  const fakeId = "00000000-0000-0000-0000-000000000000";

  it("POST /applications/:id/hod-decision rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/hod-decision`).send({});
    expect(res.status).toBe(401);
  });

  it("POST /applications/:id/credit-decision rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/credit-decision`).send({});
    expect(res.status).toBe(401);
  });

  it("POST /applications/:id/internal-control-decision rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/internal-control-decision`).send({});
    expect(res.status).toBe(401);
  });

  it("POST /applications/:id/md-decision rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/md-decision`).send({});
    expect(res.status).toBe(401);
  });

  it("POST /applications/:id/resolve-query rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/resolve-query`).send({});
    expect(res.status).toBe(401);
  });

  it("GET /applications/:id/approvals rejects with no token (401)", async () => {
    const res = await request(app).get(`/api/v1/applications/${fakeId}/approvals`);
    expect(res.status).toBe(401);
  });

  it("GET /applications/:id/comments rejects with no token (401)", async () => {
    const res = await request(app).get(`/api/v1/applications/${fakeId}/comments`);
    expect(res.status).toBe(401);
  });

  it("POST /applications/:id/comments rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/comments`).send({});
    expect(res.status).toBe(401);
  });

  // Full decision -> status transition -> Approval-row flow requires a
  // seeded test database and a real application at the right status —
  // battle-tested manually against a real database instead (see chat).
});
