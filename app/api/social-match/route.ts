import {
  cleanText,
  enforceRateLimit,
  getRuntime,
  parseJsonArray,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";
import { activeActor, ActiveActorError, ACTIVE_ACTOR_SQL } from "../../../lib/active-actor";

const interests = new Set(["music", "cinema", "books", "gaming", "technology", "art", "photography", "travel", "volunteering", "entrepreneurship", "languages", "nature", "food", "sports", "fitness", "study"]);
const intents = new Set(["study", "coffee", "meal", "walk", "sports", "event", "project", "gaming"]);
const availabilityValues = new Set(["now", "today", "week", "not-looking"]);

type MeetupRow = {
  id: string; sender_email: string; recipient_email: string; activity: string; message: string;
  proposed_time: string | null; campus_place: string; status: string; expires_at: string; created_at: string;
  sender_id: string; sender_name: string; recipient_id: string; recipient_name: string;
};
type Viewer = { email: string; publicId: string; universityId: string };
const meetupSelect = `SELECT mr.id,mr.sender_email,mr.recipient_email,mr.activity,mr.message,mr.proposed_time,mr.campus_place,
  CASE WHEN mr.status='pending' AND datetime(mr.expires_at)<=CURRENT_TIMESTAMP THEN 'expired' ELSE mr.status END AS status,
  mr.expires_at,mr.created_at,sender.public_id AS sender_id,sender.display_name AS sender_name,
  recipient.public_id AS recipient_id,recipient.display_name AS recipient_name
  FROM meetup_requests mr JOIN users sender ON sender.email=mr.sender_email JOIN users recipient ON recipient.email=mr.recipient_email
  JOIN student_profiles sender_profile ON sender_profile.user_email=mr.sender_email
  JOIN student_profiles recipient_profile ON recipient_profile.user_email=mr.recipient_email`;
const meetupAccess = `sender.status='active' AND recipient.status='active'
  AND sender_profile.onboarding_completed=1 AND recipient_profile.onboarding_completed=1
  AND sender_profile.university_id=? AND recipient_profile.university_id=?
  AND ((mr.sender_email=? AND sender.public_id=?) OR (mr.recipient_email=? AND recipient.public_id=?))
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_email=mr.sender_email AND b.blocked_email=mr.recipient_email)
    OR (b.blocker_email=mr.recipient_email AND b.blocked_email=mr.sender_email))`;
const accessValues = (viewer: Viewer): D1Value[] => [viewer.universityId, viewer.universityId, viewer.email, viewer.publicId, viewer.email, viewer.publicId];
const validRequestId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);
const privateJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const changed = () => privateJson({ error: "Buluşma isteği veya hesap bilgisi değişti. Durumu yenile.", code: "MEETUP_CHANGED" }, 409);
function serializeMeetup(row: MeetupRow, email: string) {
  const incoming = row.recipient_email === email;
  return { id: row.id, direction: incoming ? "incoming" : "outgoing", otherPublicId: incoming ? row.sender_id : row.recipient_id,
    otherName: incoming ? row.sender_name : row.recipient_name, activity: row.activity, message: row.message,
    proposedTime: row.proposed_time, campusPlace: row.campus_place, status: row.status, expiresAt: row.expires_at, time: relativeTime(row.created_at) };
}
async function readMeetup(db: D1Database, id: string, viewer: Viewer) {
  return db.prepare(`${meetupSelect} WHERE mr.id=? AND ${meetupAccess} LIMIT 1`).bind(id, ...accessValues(viewer)).first<MeetupRow>();
}
const peerGeneration = (row: MeetupRow) => [row.sender_id, row.recipient_id];
const sameGenerations = (left: MeetupRow, right: MeetupRow) => left.sender_id === right.sender_id && left.recipient_id === right.recipient_id;
const profileAccess = `EXISTS(SELECT 1 FROM student_profiles current_profile WHERE current_profile.user_email=?
  AND current_profile.university_id=? AND current_profile.onboarding_completed=1)`;
const auditMarker = `EXISTS(SELECT 1 FROM audit_logs WHERE id=?)`;

type CandidateRow = {
  public_id: string;
  display_name: string;
  handle: string;
  faculty_short_name: string;
  department_name: string;
  department_id: string;
  class_year: number;
  interests_json: string;
  intents_json: string;
  social_bio: string;
  availability: string;
  course_ids: string | null;
};

function stringArray(value: unknown, allowed: Set<string>, limit: number) {
  if (!Array.isArray(value)) return null;
  const result = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => allowed.has(item)))];
  if (result.length !== value.length || result.length > limit) return null;
  return result;
}

function intersection(left: string[], right: string[]) {
  const lookup = new Set(right);
  return left.filter((item) => lookup.has(item));
}

function scoreCandidate(input: {
  sameDepartment: boolean;
  sameClass: boolean;
  sharedInterests: string[];
  sharedIntents: string[];
  sharedCourses: string[];
}) {
  const score = Math.min(100,
    (input.sameDepartment ? 20 : 0)
    + (input.sameClass ? 6 : 0)
    + Math.min(42, input.sharedInterests.length * 14)
    + Math.min(20, input.sharedIntents.length * 10)
    + Math.min(24, input.sharedCourses.length * 8));
  const reasons: string[] = [];
  if (input.sharedInterests.length) reasons.push(`${input.sharedInterests.length} ortak ilgi`);
  if (input.sharedIntents.length) reasons.push("aynı buluşma niyeti");
  if (input.sharedCourses.length) reasons.push(`${input.sharedCourses.length} ortak ders`);
  if (input.sameDepartment) reasons.push("aynı bölüm");
  return { score, reasons: reasons.slice(0, 3) };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Öğrenci eşleşmelerini görmek için giriş yapmalısın.");
  try {
    const ids = new URL(request.url).searchParams.getAll("id");
    if (ids.length > 1 || (ids.length === 1 && !validRequestId(ids[0]))) return privateJson({ error: "Buluşma kimliği geçerli değil." }, 400);
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return privateJson({ error: ids.length ? "Buluşma isteği bulunamadı." : "Önce akademik profilini tamamlamalısın." }, ids.length ? 404 : 409);
    const viewer = { email: identity.email, publicId: profile.public_id, universityId: profile.university_id };
    if (ids.length) {
      const target = await readMeetup(DB, ids[0], viewer);
      return target ? privateJson({ request: serializeMeetup(target, identity.email) }) : privateJson({ error: "Buluşma isteği bulunamadı." }, 404);
    }
    const [socialProfile, ownCourses, candidates, requests] = await Promise.all([
      DB.prepare(
        `SELECT interests_json, intents_json, social_bio, availability, is_discoverable
         FROM student_social_profiles WHERE user_email = ? LIMIT 1`,
      ).bind(identity.email).first<{ interests_json: string; intents_json: string; social_bio: string; availability: string; is_discoverable: number }>(),
      DB.prepare(`SELECT course_id FROM student_courses WHERE user_email = ?`).bind(identity.email).all<{ course_id: string }>(),
      DB.prepare(
        `SELECT u.public_id, u.display_name, u.handle, f.short_name AS faculty_short_name,
                d.name AS department_name, sp.department_id, sp.class_year,
                ssp.interests_json, ssp.intents_json, ssp.social_bio, ssp.availability,
                (SELECT GROUP_CONCAT(sc.course_id, '|') FROM student_courses sc WHERE sc.user_email = u.email) AS course_ids
         FROM student_social_profiles ssp
         JOIN users u ON u.email = ssp.user_email
         JOIN student_profiles sp ON sp.user_email = u.email
         JOIN departments d ON d.id = sp.department_id
         JOIN faculties f ON f.id = d.faculty_id
         WHERE u.email <> ? AND sp.university_id = ? AND ssp.is_discoverable = 1 AND u.status='active' AND sp.onboarding_completed=1
           AND NOT EXISTS (
             SELECT 1 FROM user_blocks b
             WHERE (b.blocker_email = ? AND b.blocked_email = u.email)
                OR (b.blocker_email = u.email AND b.blocked_email = ?)
           )
         ORDER BY CASE ssp.availability WHEN 'now' THEN 0 WHEN 'today' THEN 1 WHEN 'week' THEN 2 ELSE 3 END,
                  ssp.updated_at DESC
         LIMIT 60`,
      ).bind(identity.email, profile.university_id, identity.email, identity.email).all<CandidateRow>(),
      DB.prepare(`${meetupSelect} WHERE ${meetupAccess}
         ORDER BY CASE WHEN mr.status='pending' AND datetime(mr.expires_at)>CURRENT_TIMESTAMP THEN 0 WHEN mr.status='accepted' THEN 1 ELSE 2 END,
           mr.created_at DESC,mr.id DESC LIMIT 80`).bind(...accessValues(viewer)).all<MeetupRow>(),
    ]);
    const ownInterests = parseJsonArray(socialProfile?.interests_json);
    const ownIntents = parseJsonArray(socialProfile?.intents_json);
    const ownCourseIds = ownCourses.results.map((course) => course.course_id);
    const matches = candidates.results.map((candidate) => {
      const sharedInterests = intersection(ownInterests, parseJsonArray(candidate.interests_json));
      const sharedIntents = intersection(ownIntents, parseJsonArray(candidate.intents_json));
      const sharedCourses = intersection(ownCourseIds, candidate.course_ids?.split("|").filter(Boolean) ?? []);
      const match = scoreCandidate({
        sameDepartment: candidate.department_id === profile.department_id,
        sameClass: candidate.class_year === profile.class_year,
        sharedInterests,
        sharedIntents,
        sharedCourses,
      });
      return {
        publicId: candidate.public_id,
        displayName: candidate.display_name,
        handle: candidate.handle,
        facultyShortName: candidate.faculty_short_name,
        departmentName: candidate.department_name,
        classYear: candidate.class_year,
        interests: parseJsonArray(candidate.interests_json),
        intents: parseJsonArray(candidate.intents_json),
        sharedInterests,
        sharedIntents,
        availability: candidate.availability,
        bio: candidate.social_bio,
        score: match.score,
        reasons: match.reasons,
      };
    }).sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName, "tr-TR"));
    // The list uses several reads; do not return their accumulated data if the
    // authenticated account generation or campus changed while they were pending.
    if (!await DB.prepare(`SELECT 1 WHERE ${profileAccess} AND ${ACTIVE_ACTOR_SQL}`)
      .bind(identity.email, profile.university_id, identity.email, profile.public_id).first()) return changed();
    return privateJson({
      profile: {
        interests: ownInterests,
        intents: ownIntents,
        bio: socialProfile?.social_bio ?? "",
        availability: socialProfile?.availability ?? "not-looking",
        discoverable: socialProfile ? Boolean(socialProfile.is_discoverable) : true,
        configured: Boolean(socialProfile),
      },
      matches,
      requests: requests.results.map(row => serializeMeetup(row, identity.email)),
    });
  } catch (error) {
    return unavailableResponse(error, "Öğrenci eşleşmeleri şu anda getirilemiyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Sosyal eşleşme bilgisi geçerli değil." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return privateJson({ error: "Sosyal eşleşme bilgisi geçerli değil." }, 400);
  const action = cleanText(payload.action, 24);
  if (!["save-profile", "request"].includes(action)) return Response.json({ error: "Sosyal eşleşme işlemi desteklenmiyor." }, { status: 400 });
  const selectedInterests = action === "save-profile" ? stringArray(payload.interests, interests, 12) : [];
  const selectedIntents = action === "save-profile" ? stringArray(payload.intents, intents, 4) : [];
  const bio = cleanText(payload.bio, 240);
  const availability = cleanText(payload.availability, 20);
  const discoverable = payload.discoverable !== false;
  if (action === "save-profile" && (!selectedInterests || selectedInterests.length < 2)) return Response.json({ error: "En az iki ilgi alanı seçmelisin." }, { status: 400 });
  if (action === "save-profile" && (!selectedIntents || selectedIntents.length < 1)) return Response.json({ error: "En az bir sosyalleşme niyeti seçmelisin." }, { status: 400 });
  if (action === "save-profile" && !availabilityValues.has(availability)) return Response.json({ error: "Müsaitlik seçimi geçerli değil." }, { status: 400 });
  const targetPublicId = typeof payload.targetPublicId === "string" ? payload.targetPublicId : "";
  const activity = cleanText(payload.activity, 20);
  const message = cleanText(payload.message, 400);
  const campusPlace = cleanText(payload.campusPlace, 80);
  const proposedTimeInput = cleanText(payload.proposedTime, 40);
  if (action === "request" && (!validRequestId(targetPublicId) || !intents.has(activity))) return Response.json({ error: "Buluşma türü veya öğrenci geçerli değil." }, { status: 400 });
  if (action === "request" && message.length < 8) return Response.json({ error: "Buluşma mesajı en az 8 karakter olmalı." }, { status: 400 });
  let proposedTime: string | null = null;
  if (action === "request" && proposedTimeInput) {
    const timestamp = Date.parse(proposedTimeInput);
    if (!Number.isFinite(timestamp) || timestamp < Date.now() - 5 * 60_000 || timestamp > Date.now() + 30 * 24 * 60 * 60 * 1000) {
      return Response.json({ error: "Buluşma zamanı önümüzdeki 30 gün içinde olmalı." }, { status: 400 });
    }
    proposedTime = new Date(timestamp).toISOString();
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const actor = activeActor(DB, identity.email, profile.public_id);
    const viewer = { email: identity.email, publicId: profile.public_id, universityId: profile.university_id };

    if (action === "save-profile") {
      const safeInterests = selectedInterests ?? [];
      const safeIntents = selectedIntents ?? [];
      const marker = crypto.randomUUID();
      await actor.batch([
        actor.statement(`INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,detail)
          SELECT ?,?,'social-profile.updated','user',?,? WHERE ${profileAccess} AND ${ACTIVE_ACTOR_SQL}`,
        [marker, identity.email, profile.public_id, JSON.stringify({ interests: safeInterests.length, intents: safeIntents.length, discoverable }), identity.email, profile.university_id]),
        actor.statement(
        `INSERT INTO student_social_profiles
         (user_email, interests_json, intents_json, social_bio, availability, is_discoverable)
         SELECT ?, ?, ?, ?, ?, ? WHERE ${auditMarker} AND ${ACTIVE_ACTOR_SQL}
         ON CONFLICT(user_email) DO UPDATE SET
           interests_json = excluded.interests_json,
           intents_json = excluded.intents_json,
           social_bio = excluded.social_bio,
           availability = excluded.availability,
           is_discoverable = excluded.is_discoverable,
           updated_at = CURRENT_TIMESTAMP`,
        [identity.email, JSON.stringify(safeInterests), JSON.stringify(safeIntents), bio, availability, discoverable ? 1 : 0, marker]),
      ]);
      if (!await DB.prepare("SELECT id FROM audit_logs WHERE id=?").bind(marker).first()) return changed();
      return privateJson({ saved: true });
    }

    const limit = await enforceRateLimit(DB, identity.email, "meetup-request", 12, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const target = await DB.prepare(
      `SELECT u.email, u.public_id FROM users u
       JOIN student_profiles sp ON sp.user_email = u.email
       JOIN student_social_profiles ssp ON ssp.user_email = u.email
       WHERE u.public_id = ? AND u.email <> ? AND sp.university_id = ? AND ssp.is_discoverable = 1
         AND u.status='active' AND sp.onboarding_completed=1
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = u.email)
              OR (b.blocker_email = u.email AND b.blocked_email = ?)
         )
       LIMIT 1`,
    ).bind(targetPublicId, identity.email, profile.university_id, identity.email, identity.email).first<{ email: string; public_id: string }>();
    if (!target) return Response.json({ error: "Eşleşme için uygun öğrenci bulunamadı." }, { status: 404 });
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createdMarker = `EXISTS(SELECT 1 FROM meetup_requests WHERE id=?)`;
    const statements = [actor.statement(
      `INSERT INTO meetup_requests
       (id, sender_email, recipient_email, activity, message, proposed_time, campus_place, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${profileAccess}
       AND EXISTS(SELECT 1 FROM users peer JOIN student_profiles sp ON sp.user_email=peer.email
         JOIN student_social_profiles ssp ON ssp.user_email=peer.email
         WHERE peer.email=? AND peer.public_id=? AND peer.status='active' AND sp.onboarding_completed=1
           AND sp.university_id=? AND ssp.is_discoverable=1)
       AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_email=? AND b.blocked_email=?) OR (b.blocker_email=? AND b.blocked_email=?))
       AND NOT EXISTS(SELECT 1 FROM meetup_requests WHERE status='pending' AND datetime(expires_at)>CURRENT_TIMESTAMP
         AND ((sender_email=? AND recipient_email=?) OR (sender_email=? AND recipient_email=?)))
       AND ${ACTIVE_ACTOR_SQL}`,
      [id, identity.email, target.email, activity, message, proposedTime, campusPlace, expiresAt,
        identity.email, profile.university_id, target.email, target.public_id, profile.university_id,
        identity.email, target.email, target.email, identity.email, identity.email, target.email, target.email, identity.email]),
      actor.statement(`INSERT INTO notifications(id,user_email,actor_email,kind,title,body,entity_type,entity_id)
        SELECT ?,?,?,'community','Yeni buluşma isteği',?,'meetup',? WHERE ${createdMarker} AND ${ACTIVE_ACTOR_SQL}`,
      [crypto.randomUUID(), target.email, identity.email, `${profile.display_name} seninle kampüste buluşmak istiyor.`, id, id]),
      actor.statement(`INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,detail)
        SELECT ?,?,'meetup-request.created','meetup',?,? WHERE ${createdMarker} AND ${ACTIVE_ACTOR_SQL}`,
      [crypto.randomUUID(), identity.email, id, JSON.stringify({ activity }), id]),
    ];
    try { await actor.batch(statements); }
    catch (error) {
      // An acknowledged row recovers an unknown batch response without sending another request.
      const committed = await readMeetup(DB, id, viewer);
      if (!committed || committed.recipient_id !== target.public_id) throw error;
      return privateJson({ request: { id, status: committed.status, expiresAt } }, 201);
    }
    const committed = await readMeetup(DB, id, viewer);
    if (!committed || committed.recipient_id !== target.public_id) return changed();
    return privateJson({ request: { id, status: committed.status, expiresAt } }, 201);
  } catch (error) {
    if (error instanceof ActiveActorError) return changed();
    return unavailableResponse(error, "Sosyal eşleşme işlemi şu anda tamamlanamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Buluşma yanıtı geçerli değil." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return privateJson({ error: "Buluşma yanıtı geçerli değil." }, 400);
  const id = typeof payload.id === "string" ? payload.id : "";
  const decision = cleanText(payload.decision, 20);
  if (!validRequestId(id) || !["accepted", "declined", "cancelled"].includes(decision)) {
    return Response.json({ error: "Buluşma kararı geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return changed();
    const viewer = { email: identity.email, publicId: profile.public_id, universityId: profile.university_id };
    const original = await readMeetup(DB, id, viewer);
    const ownerColumn = decision === "cancelled" ? "sender_email" : "recipient_email";
    if (!original || original[ownerColumn] !== identity.email) return privateJson({ error: "Yanıtlanabilecek buluşma isteği bulunamadı." }, 404);
    if (original.status === decision) return privateJson({ status: decision, request: serializeMeetup(original, identity.email) });
    if (original.status !== "pending") return changed();
    const actor = activeActor(DB, identity.email, profile.public_id);
    const marker = crypto.randomUUID();
    // The audit row is the transaction's unique winner marker. A competing decision
    // cannot create this marker once the pending state has changed.
    const statements = [actor.statement(`INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,detail)
      SELECT ?,?,?, 'meetup',?,'{}' WHERE EXISTS(${meetupSelect} WHERE mr.id=? AND ${meetupAccess}
        AND sender.public_id=? AND recipient.public_id=? AND mr.${ownerColumn}=?
        AND mr.status='pending' AND datetime(mr.expires_at)>CURRENT_TIMESTAMP) AND ${ACTIVE_ACTOR_SQL}`,
    [marker, identity.email, `meetup-request.${decision}`, id, id, ...accessValues(viewer), ...peerGeneration(original), identity.email]),
      actor.statement(`UPDATE meetup_requests SET status=?,responded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND ${auditMarker} AND ${ACTIVE_ACTOR_SQL}`, [decision, id, marker]),
    ];
    if (decision !== "cancelled") {
      statements.push(actor.statement(`INSERT INTO notifications(id,user_email,actor_email,kind,title,body,entity_type,entity_id)
        SELECT ?,?,?,'community',?,?,'meetup',? WHERE ${auditMarker} AND ${ACTIVE_ACTOR_SQL}`,
      [crypto.randomUUID(), original.sender_email, identity.email,
        decision === "accepted" ? "Buluşma isteğin kabul edildi" : "Buluşma isteğin yanıtlandı",
        decision === "accepted" ? "Ayrıntıları Buluşmalar alanından görebilirsin." : "Öğrenci bu buluşma isteğini kabul etmedi.", id, marker]));
    }
    try { await actor.batch(statements); }
    catch (error) {
      const committed = await readMeetup(DB, id, viewer);
      if (!committed || !sameGenerations(original, committed) || committed.status !== decision) throw error;
      return privateJson({ status: decision, request: serializeMeetup(committed, identity.email) });
    }
    const updated = await readMeetup(DB, id, viewer);
    if (!updated || !sameGenerations(original, updated) || updated.status !== decision) return changed();
    return privateJson({ status: decision, request: serializeMeetup(updated, identity.email) });
  } catch (error) {
    if (error instanceof ActiveActorError) return changed();
    return unavailableResponse(error, "Buluşma isteği şu anda güncellenemedi.");
  }
}
