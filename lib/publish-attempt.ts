import { createSecureRandomKey } from "./secure-random-key";

export type PublishDraft = { content: string; audience: "platform" | "campus"; courseId: string | null; media: File | null; mediaFiles?: readonly File[] };
export type PublishAttemptSnapshot = { key: string; draft: PublishDraft; uncertain: boolean };

/** Ordered files are authoritative when present; media keeps older single-file callers compatible. */
export function publishDraftMedia(draft: Pick<PublishDraft, "media" | "mediaFiles">): readonly File[] {
  return draft.mediaFiles ?? (draft.media ? [draft.media] : []);
}
export function copyPublishDraft(draft: PublishDraft): PublishDraft {
  return { ...draft, ...(draft.mediaFiles ? { mediaFiles: [...draft.mediaFiles] } : {}) };
}
function immutableDraft(draft: PublishDraft): PublishDraft {
  const copy = copyPublishDraft(draft);
  if (copy.mediaFiles) Object.freeze(copy.mediaFiles);
  return Object.freeze(copy);
}

/** One immutable payload/key survives an unknown network outcome. A known rejection can start a new draft. */
export function createPublishAttempt(makeKey = createSecureRandomKey) {
  let attempt: PublishAttemptSnapshot | null = null;
  return {
    begin(draft: PublishDraft) {
      if (attempt?.uncertain) return attempt;
      if (!attempt) attempt = { key: makeKey(), draft: immutableDraft(draft), uncertain: false };
      return attempt;
    },
    failed(status?: number) {
      // A later auth/quota/validation rejection cannot disprove an earlier request's unknown commit.
      // Keep its key and immutable draft until a confirmed success or an explicit context reset.
      if (attempt?.uncertain) return true;
      // 5xx, transport loss and content-key conflicts cannot prove that the original post was not committed.
      if (attempt && (!status || status < 400 || status >= 500 || status === 409)) attempt.uncertain = true;
      else attempt = null;
      return Boolean(attempt?.uncertain);
    },
    complete() { attempt = null; },
    reset() { attempt = null; },
    snapshot(): PublishAttemptSnapshot | null { return attempt ? { ...attempt, draft: copyPublishDraft(attempt.draft) } : null; },
    resume(snapshot: PublishAttemptSnapshot) {
      if (attempt || !snapshot || typeof snapshot.key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(snapshot.key)) return false;
      // After reload there is no acknowledgement proving whether a persisted attempt reached the server.
      attempt = { key: snapshot.key, draft: immutableDraft(snapshot.draft), uncertain: true };
      return true;
    },
  };
}
