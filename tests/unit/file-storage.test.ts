import fs from "fs/promises";
import os from "os";
import path from "path";

describe("file-storage", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lats-storage-"));
    // Set before file-storage is imported: env.ts reads these at import time.
    process.env.FILE_STORAGE_DIR = tmpDir;
    process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
    process.env.JWT_SECRET ??= "test-secret";
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a forward-slash path so the stored value is portable across OSes", async () => {
    const { saveFile } = await import("../../src/utils/file-storage");
    const stored = await saveFile("app-123", "id-card.pdf", Buffer.from("x"));
    expect(stored).not.toContain("\\");
    expect(stored.startsWith("app-123/")).toBe(true);
    expect(stored.endsWith(".pdf")).toBe(true);
  });

  it("never uses the uploaded filename on disk", async () => {
    const { saveFile } = await import("../../src/utils/file-storage");
    const stored = await saveFile("app-123", "../../etc/passwd.pdf", Buffer.from("x"));
    expect(stored).not.toContain("passwd");
    expect(stored).not.toContain("..");
  });

  it("round-trips: getFile returns exactly what saveFile wrote", async () => {
    const { saveFile, getFile } = await import("../../src/utils/file-storage");
    const stored = await saveFile("app-456", "a.png", Buffer.from("hello-bytes"));
    const back = await getFile(stored);
    expect(back.toString()).toBe("hello-bytes");
  });
});
