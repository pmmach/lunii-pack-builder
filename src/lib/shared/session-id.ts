import path from "node:path";

/** UUID v4 (format produit par `crypto.randomUUID()`). */
const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_RE.test(sessionId);
}

export function sessionWorkspaceRoot(sessionId: string): string {
  return path.resolve(process.cwd(), "workspace", sessionId);
}

/** Vrai si `candidate` est égal à `root` ou un fichier/dossier descendant. */
export function isPathInsideDir(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const rel = path.relative(resolvedRoot, resolvedCandidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function isPathInsideSessionWorkspace(
  filePath: string,
  sessionId: string
): boolean {
  if (!isValidSessionId(sessionId)) return false;
  return isPathInsideDir(sessionWorkspaceRoot(sessionId), filePath);
}
