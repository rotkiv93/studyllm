import { describe, it, expect } from "vitest";
import {
  buildOutgoingContent,
  isSupportedAttachment,
  ATTACHMENT_MARKER,
  type ParsedAttachment,
} from "./attachments";

const att = (name: string, text: string, truncated = false): ParsedAttachment => ({
  name,
  text,
  truncated,
});

describe("isSupportedAttachment", () => {
  it("accepts text and pdf extensions, case-insensitively", () => {
    expect(isSupportedAttachment("notes.txt")).toBe(true);
    expect(isSupportedAttachment("Treaty.PDF")).toBe(true);
    expect(isSupportedAttachment("data.csv")).toBe(true);
    expect(isSupportedAttachment("readme.md")).toBe(true);
    expect(isSupportedAttachment("essay.docx")).toBe(true);
  });

  it("rejects unsupported, legacy .doc, or extensionless files", () => {
    expect(isSupportedAttachment("photo.png")).toBe(false);
    expect(isSupportedAttachment("archive.zip")).toBe(false);
    expect(isSupportedAttachment("old.doc")).toBe(false);
    expect(isSupportedAttachment("Makefile")).toBe(false);
  });
});

describe("buildOutgoingContent", () => {
  it("returns the typed text unchanged when there are no attachments", () => {
    expect(buildOutgoingContent("hello", [])).toBe("hello");
  });

  it("puts the typed text first so it drives the conversation title", () => {
    const out = buildOutgoingContent("Summarize this", [att("a.txt", "file body")]);
    expect(out.startsWith("Summarize this")).toBe(true);
    expect(out).toContain(`${ATTACHMENT_MARKER} a.txt ---`);
    expect(out).toContain("file body");
  });

  it("still sends attachment blocks when no message was typed", () => {
    const out = buildOutgoingContent("   ", [att("a.txt", "body")]);
    expect(out.startsWith(`${ATTACHMENT_MARKER} a.txt ---`)).toBe(true);
  });

  it("marks truncated files and separates multiple attachments", () => {
    const out = buildOutgoingContent("q", [att("a.txt", "aaa", true), att("b.txt", "bbb")]);
    expect(out).toContain("[… truncated …]");
    expect((out.match(new RegExp(ATTACHMENT_MARKER.replace(/[-]/g, "\\-"), "g")) ?? []).length).toBe(2);
  });
});
