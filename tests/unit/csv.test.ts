import { csvCell, forceText, toCsv } from "../../src/utils/csv";

describe("csvCell", () => {
  it("leaves plain values alone and blanks null/undefined", () => {
    expect(csvCell("Ada Obi")).toBe("Ada Obi");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("quotes values with commas, quotes or line breaks and doubles inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("defuses spreadsheet formulas by prefixing an apostrophe", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });
});

describe("forceText (phone numbers)", () => {
  it("keeps a leading zero by writing the number as an Excel text literal", () => {
    expect(csvCell(forceText("08012345678"))).toBe('"=""08012345678"""');
  });

  it("does not turn arbitrary text into a text literal", () => {
    expect(forceText('0"; DROP')).toBe('0"; DROP');
    expect(forceText("")).toBe("");
    expect(forceText(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with a byte-order mark, uses CRLF, and ends with a newline", () => {
    const out = toCsv(["A", "B"], [["1", "x,y"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe('﻿A,B\r\n1,"x,y"\r\n');
  });
});
