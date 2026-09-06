type ScrollSnapshot = { conversationId: string | null; lastMessageId: string | null };

/** Polls may change read receipts and relative times without adding a message. */
export function shouldFollowMessages(previous: ScrollSnapshot, next: ScrollSnapshot, nearBottom: boolean, ownSend = false) {
  if (!next.lastMessageId) return false;
  if (ownSend || previous.conversationId !== next.conversationId || !previous.lastMessageId) return true;
  return previous.lastMessageId !== next.lastMessageId && nearBottom;
}

export function mergeMessages<T extends { id: string; createdAt: string }>(current: T[], incoming: T[]): T[] {
  const items = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) items.set(message.id, message);
  return [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
