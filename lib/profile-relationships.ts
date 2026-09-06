export type RelationshipKind = "followers" | "following";
export type RelationshipPerson = {
  publicId: string; displayName: string; handle: string; avatarUrl: string | null;
  universityShortName: string; isFollowing: boolean; isSelf: boolean;
};
export type RelationshipPage = {
  targetId: string; kind: RelationshipKind; query: string; viewerId: string;
  people: RelationshipPerson[]; nextCursor: string | null; error?: string;
};
export const unavailableRelationshipProfile = "Bu profilin takip listesine erişilemiyor.";

let relationshipRevision = 0;
const relationshipListeners = new Set<() => void>();
export const getProfileRelationshipRevision = () => relationshipRevision;
export function subscribeProfileRelationships(listener: () => void) { relationshipListeners.add(listener); return () => { relationshipListeners.delete(listener); }; }
/** Invalidate only relationship snapshots after a confirmed follow or safety change. */
export function invalidateProfileRelationships() { relationshipRevision++; for (const listener of relationshipListeners) listener(); }

export function validRelationshipPage(value: RelationshipPage, targetId: string, kind: RelationshipKind, query: string): boolean {
  return Boolean(value && value.targetId === targetId && value.kind === kind && value.query === query && typeof value.viewerId === "string" &&
    (value.nextCursor === null || typeof value.nextCursor === "string") && Array.isArray(value.people) && value.people.every((person) =>
      person && typeof person.publicId === "string" && typeof person.displayName === "string" && typeof person.handle === "string" &&
      (person.avatarUrl === null || typeof person.avatarUrl === "string") && typeof person.universityShortName === "string" && typeof person.isFollowing === "boolean" && typeof person.isSelf === "boolean"));
}
