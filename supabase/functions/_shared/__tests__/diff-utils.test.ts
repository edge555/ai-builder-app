/**
 * Simple test for diff-utils.ts
 * Run with: deno test supabase/functions/_shared/__tests__/diff-utils.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeFileDiff, computeLineHunks } from "../diff-utils.ts";

Deno.test("computeLineHunks - should handle file creation (all adds)", () => {
    const oldLines: string[] = [];
    const newLines = ["line1", "line2", "line3"];

    const hunks = computeLineHunks(oldLines, newLines);

    assertEquals(hunks.length, 1);
    assertEquals(hunks[0].changes.length, 3);
    assertEquals(hunks[0].changes.every(c => c.type === 'add'), true);
});

Deno.test("computeLineHunks - should handle file deletion (all deletes)", () => {
    const oldLines = ["line1", "line2", "line3"];
    const newLines: string[] = [];

    const hunks = computeLineHunks(oldLines, newLines);

    assertEquals(hunks.length, 1);
    assertEquals(hunks[0].changes.length, 3);
    assertEquals(hunks[0].changes.every(c => c.type === 'delete'), true);
});

Deno.test("computeLineHunks - should handle line modification", () => {
    const oldLines = ["line1", "old content", "line3"];
    const newLines = ["line1", "new content", "line3"];

    const hunks = computeLineHunks(oldLines, newLines);

    assertEquals(hunks.length, 1);

    const deleteChanges = hunks[0].changes.filter(c => c.type === 'delete');
    const addChanges = hunks[0].changes.filter(c => c.type === 'add');

    assertEquals(deleteChanges.length, 1);
    assertEquals(deleteChanges[0].content, "old content");
    assertEquals(addChanges.length, 1);
    assertEquals(addChanges[0].content, "new content");
});

Deno.test("computeLineHunks - should handle no changes", () => {
    const lines = ["line1", "line2", "line3"];
    const hunks = computeLineHunks(lines, lines);

    assertEquals(hunks.length, 0);
});

Deno.test("computeFileDiff - should create FileDiff for added file", () => {
    const diff = computeFileDiff("test.ts", undefined, "const x = 1;\nconst y = 2;");

    assertEquals(diff.filePath, "test.ts");
    assertEquals(diff.status, "added");
    assertEquals(diff.hunks.length, 1);
    assertEquals(diff.hunks[0].changes.every(c => c.type === 'add'), true);
});

Deno.test("computeFileDiff - should create FileDiff for deleted file", () => {
    const diff = computeFileDiff("test.ts", "const x = 1;\nconst y = 2;", undefined);

    assertEquals(diff.filePath, "test.ts");
    assertEquals(diff.status, "deleted");
    assertEquals(diff.hunks.length, 1);
    assertEquals(diff.hunks[0].changes.every(c => c.type === 'delete'), true);
});

Deno.test("computeFileDiff - should create FileDiff for modified file", () => {
    const before = "const x = 1;\nconst y = 2;";
    const after = "const x = 1;\nconst y = 3;";
    const diff = computeFileDiff("test.ts", before, after);

    assertEquals(diff.filePath, "test.ts");
    assertEquals(diff.status, "modified");
    assertEquals(diff.hunks.length, 1);

    const changes = diff.hunks[0].changes;
    const hasDelete = changes.some(c => c.type === 'delete' && c.content === 'const y = 2;');
    const hasAdd = changes.some(c => c.type === 'add' && c.content === 'const y = 3;');

    assertEquals(hasDelete, true);
    assertEquals(hasAdd, true);
});
