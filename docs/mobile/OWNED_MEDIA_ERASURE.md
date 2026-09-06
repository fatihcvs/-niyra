# Owned uploads and shared account actions

Phase 5 adds an independent `media_upload_operations` registry in migration `0032`. Every R2 PUT in notes, profile media, campus pulse, posts and marketplace photos is registered before bytes are sent. The row captures the exact object key, family, owner email and the authenticated profile's public ID. It has no user foreign key, so deleting the user cannot destroy evidence of an outstanding upload.

- `putting`: registration is durable, but PUT fulfillment is not confirmed.
- `settled`: the actual PUT fulfilled and settlement was recorded.
- `unknown`: PUT rejected or its acknowledgement was lost. This is not evidence that bytes were never stored.

The erasure engine must retain `putting` and `unknown` operations. A successful HEAD or DELETE, an absent object, or elapsed time does not prove an outstanding PUT cannot later finish. Registry rows are purged only by the engine's confirmed completion transaction. Legacy post/market ledgers remain in place; their cleanup skips generic operations whose PUT is unresolved. New retries use unique object keys.

Publication SQL also checks that the captured owner public ID still belongs to the active account. This closes the interval after the fulfilled PUT check and before publication, including replacement of an account with a new account using the same email. Notes processing metadata and post-publication audit/notification writes also retain this generation check.

Shared communities, community events, campus guide and library mutations use `activeActor` with an explicit `ACTIVE_ACTOR_SQL` condition in every primary mutation. The condition checks the acting user's email, captured public ID and active status. Guarded audit/notification inserts and a response check prevent stale success and stale actor details. A retained container's original creator is not used as the actor condition: remaining authorized members can continue managing it.

## Verification

The scoped suite contains 151 passing tests using actual migrations and SQLite with synthetic R2 storage. It covers the five media families, durable registration before PUT, deferred PUT completion after account freeze, lost PUT and database acknowledgements, unique object ownership, stale publication after the helper returns, 25 shared operations at active/frozen/replaced account boundaries, and management of retained containers by remaining members.

Evidence: `exports/mobile-remaining-code-2026-09-06/phase5/upload-shared/verification.json` and `tests.txt`. ESLint passed for the changed source. These are local code and synthetic data checks; no real user's account was erased and no production deletion or provider storage completion is claimed.
