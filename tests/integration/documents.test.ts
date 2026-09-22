import request from "supertest";
import { createApp } from "../../src/app";

describe("Document endpoints require auth", () => {
  const app = createApp();
  const fakeId = "00000000-0000-0000-0000-000000000000";

  it("GET /applications/:id/documents rejects with no token (401)", async () => {
    const res = await request(app).get(`/api/v1/applications/${fakeId}/documents`);
    expect(res.status).toBe(401);
  });

  it("POST /applications/:id/documents rejects with no token (401)", async () => {
    const res = await request(app).post(`/api/v1/applications/${fakeId}/documents`);
    expect(res.status).toBe(401);
  });

  it("PATCH /applications/:id/documents/:documentId rejects with no token (401)", async () => {
    const res = await request(app).patch(`/api/v1/applications/${fakeId}/documents/${fakeId}`).send({});
    expect(res.status).toBe(401);
  });

  // Full upload -> list -> verify-status flow requires a seeded test
  // database and a real multipart request — add once CI runs migrations.
});
