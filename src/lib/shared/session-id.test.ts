import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPathInsideDir,
  isPathInsideSessionWorkspace,
  isValidSessionId,
  sessionWorkspaceRoot,
} from "./session-id";

describe("isValidSessionId", () => {
  it("accepte un UUID v4", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      true
    );
  });

  it("rejette traversal et formats invalides", () => {
    expect(isValidSessionId("..")).toBe(false);
    expect(isValidSessionId("../etc")).toBe(false);
    expect(isValidSessionId("sess")).toBe(false);
    expect(isValidSessionId("550e8400-e29b-31d4-a716-446655440000")).toBe(
      false
    );
    expect(isValidSessionId("")).toBe(false);
  });
});

describe("isPathInsideDir / isPathInsideSessionWorkspace", () => {
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";

  it("accepte un chemin sous la session", () => {
    const root = sessionWorkspaceRoot(sessionId);
    const file = path.join(root, "processed", "ep", "story.mp3");
    expect(isPathInsideDir(root, file)).toBe(true);
    expect(isPathInsideSessionWorkspace(file, sessionId)).toBe(true);
  });

  it("rejette un chemin hors workspace session", () => {
    expect(
      isPathInsideSessionWorkspace(
        path.join(process.cwd(), "server.js"),
        sessionId
      )
    ).toBe(false);
    expect(
      isPathInsideSessionWorkspace(
        path.join(process.cwd(), "workspace", "other", "x.mp3"),
        sessionId
      )
    ).toBe(false);
  });
});
