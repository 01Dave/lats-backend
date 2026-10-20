import { detectFileType, contentMatchesDeclaredType } from "../../src/utils/file-signature";

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("rest of file")]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const TEXT_BYTES = Buffer.from("just a plain text file pretending to be something else");

describe("detectFileType", () => {
  it("identifies a PDF by its %PDF- header", () => {
    expect(detectFileType(PDF_BYTES)).toBe("pdf");
  });

  it("identifies a PNG by its 8-byte signature", () => {
    expect(detectFileType(PNG_BYTES)).toBe("png");
  });

  it("identifies a JPEG by its FF D8 FF header", () => {
    expect(detectFileType(JPEG_BYTES)).toBe("jpeg");
  });

  it("returns null for plain text", () => {
    expect(detectFileType(TEXT_BYTES)).toBeNull();
  });

  it("returns null for an empty buffer and one shorter than a signature", () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe("contentMatchesDeclaredType", () => {
  it("accepts content that matches its declared type", () => {
    expect(contentMatchesDeclaredType(PDF_BYTES, "application/pdf")).toBe(true);
    expect(contentMatchesDeclaredType(PNG_BYTES, "image/png")).toBe(true);
    expect(contentMatchesDeclaredType(JPEG_BYTES, "image/jpeg")).toBe(true);
  });

  it("rejects a text file declared as a PDF (the renamed-file case)", () => {
    expect(contentMatchesDeclaredType(TEXT_BYTES, "application/pdf")).toBe(false);
  });

  it("rejects real content declared as a different type", () => {
    expect(contentMatchesDeclaredType(PNG_BYTES, "application/pdf")).toBe(false);
    expect(contentMatchesDeclaredType(PDF_BYTES, "image/jpeg")).toBe(false);
  });

  it("rejects an unsupported declared type even when the bytes are valid", () => {
    expect(contentMatchesDeclaredType(PDF_BYTES, "text/plain")).toBe(false);
  });
});
