import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  notify,
  parseJsonArray,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

const interests = new Set(["music", "cinema", "books", "gaming", "technology", "art", "photography", "travel", "volunteering", "entrepreneurship", "languages", "nature", "food", "sports", "fitness", "study"]);
const intents = new Set(["study", "coffee", "meal", "walk", "sports", "event", "project", "gaming"]);
const availabilityValues = new Set(["now", "today", "week", "not-looking"]);

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

export async function GET() {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Öğrenci eşleşmelerini görmek için giriş yapmalısın.");
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    await DB.prepare(
      `UPDATE meetup_requests SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending' AND datetime(expires_at) <= CURRENT_TIMESTAMP`,
    ).run();
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
         WHERE u.email <> ? AND sp.university_id = ? AND ssp.is_discoverable = 1
           AND NOT EXISTS (
             SELECT 1 FROM user_blocks b
             WHERE (b.blocker_email = ? AND b.blocked_email = u.email)
                OR (b.blocker_email = u.email AND b.blocked_email = ?)
           )
         ORDER BY CASE ssp.availability WHEN 'now' THEN 0 WHEN 'today' THEN 1 WHEN 'week' THEN 2 ELSE 3 END,
                  ssp.updated_at DESC
         LIMIT 60`,
      ).bind(identity.email, profile.university_id, identity.email, identity.email).all<CandidateRow>(),
      DB.prepare(
        `SELECT mr.id, mr.sender_email, mr.recipient_email, mr.activity, mr.message,
                mr.proposed_time, mr.campus_place, mr.status, mr.expires_at, mr.created_at,
                sender.public_id AS sender_id, sender.display_name AS sender_name,
                recipient.public_id AS recipient_id, recipient.display_name AS recipient_name
         FROM meetup_requests mr
         JOIN users sender ON sender.email = mr.sender_email
         JOIN users recipient ON recipient.email = mr.recipient_email
         WHERE mr.sender_email = ? OR mr.recipient_email = ?
         ORDER BY CASE mr.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, mr.created_at DESC
         LIMIT 80`,
      ).bind(identity.email, identity.email).all<{
        id: string; sender_email: string; recipient_email: string; activity: string; message: string;
        proposed_time: string | null; campus_place: string; status: string; expires_at: string; created_at: string;
        sender_id: string; sender_name: string; recipient_id: string; recipient_name: string;
      }>(),
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
    return Response.json({
      profile: {
        interests: ownInterests,
        intents: ownIntents,
        bio: socialProfile?.social_bio ?? "",
        availability: socialProfile?.availability ?? "not-looking",
        discoverable: socialProfile ? Boolean(socialProfile.is_discoverable) : true,
        configured: Boolean(socialProfile),
      },
      matches,
      requests: requests.results.map((request) => {
        const incoming = request.recipient_email === identity.email;
        return {
          id: request.id,
          direction: incoming ? "incoming" : "outgoing",
          otherPublicId: incoming ? request.sender_id : request.recipient_id,
          otherName: incoming ? request.sender_name : request.recipient_name,
          activity: request.activity,
          message: request.message,
          proposedTime: request.proposed_time,
          campusPlace: request.campus_place,
          status: request.status,
          expiresAt: request.expires_at,
          time: relativeTime(request.created_at),
        };
      }),
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
  const targetPublicId = cleanText(payload.targetPublicId, 80);
  const activity = cleanText(payload.activity, 20);
  const message = cleanText(payload.message, 400);
  const campusPlace = cleanText(payload.campusPlace, 80);
  const proposedTimeInput = cleanText(payload.proposedTime, 40);
  if (action === "request" && (!targetPublicId || !intents.has(activity))) return Response.json({ error: "Buluşma türü veya öğrenci geçerli değil." }, { status: 400 });
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

    if (action === "save-profile") {
      const safeInterests = selectedInterests ?? [];
      const safeIntents = selectedIntents ?? [];
      await DB.prepare(
        `INSERT INTO student_social_profiles
         (user_email, interests_json, intents_json, social_bio, availability, is_discoverable)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_email) DO UPDATE SET
           interests_json = excluded.interests_json,
           intents_json = excluded.intents_json,
           social_bio = excluded.social_bio,
           availability = excluded.availability,
           is_discoverable = excluded.is_discoverable,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(identity.email, JSON.stringify(safeInterests), JSON.stringify(safeIntents), bio, availability, discoverable ? 1 : 0).run();
      await audit(DB, identity.email, "social-profile.updated", "user", profile.public_id, { interests: safeInterests.length, intents: safeIntents.length, discoverable });
      return Response.json({ saved: true });
    }

    const limit = await enforceRateLimit(DB, identity.email, "meetup-request", 12, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const target = await DB.prepare(
      `SELECT u.email, u.display_name FROM users u
       JOIN student_profiles sp ON sp.user_email = u.email
       JOIN student_social_profiles ssp ON ssp.user_email = u.email
       WHERE u.public_id = ? AND u.email <> ? AND sp.university_id = ? AND ssp.is_discoverable = 1
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = u.email)
              OR (b.blocker_email = u.email AND b.blocked_email = ?)
         )
       LIMIT 1`,
    ).bind(targetPublicId, identity.email, profile.university_id, identity.email, identity.email).first<{ email: string; display_name: string }>();
    if (!target) return Response.json({ error: "Eşleşme için uygun öğrenci bulunamadı." }, { status: 404 });
    const duplicate = await DB.prepare(
      `SELECT id FROM meetup_requests
       WHERE status = 'pending' AND datetime(expires_at) > CURRENT_TIMESTAMP
         AND ((sender_email = ? AND recipient_email = ?) OR (sender_email = ? AND recipient_email = ?))
       LIMIT 1`,
    ).bind(identity.email, target.email, target.email, identity.email).first();
    if (duplicate) return Response.json({ error: "Bu öğrenciyle açık bir buluşma isteğin zaten var." }, { status: 409 });
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await DB.prepare(
      `INSERT INTO meetup_requests
       (id, sender_email, recipient_email, activity, message, proposed_time, campus_place, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, identity.email, target.email, activity, message, proposedTime, campusPlace, expiresAt).run();
    await Promise.all([
      notify(DB, { userEmail: target.email, actorEmail: identity.email, kind: "community", title: "Yeni buluşma isteği", body: `${profile.display_name} seninle kampüste buluşmak istiyor.`, entityType: "meetup", entityId: id }),
      audit(DB, identity.email, "meetup-request.created", "meetup", id, { activity }),
    ]);
    return Response.json({ request: { id, status: "pending", expiresAt } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Sosyal eşleşme işlemi şu anda tamamlanamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Buluşma yanıtı geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  const decision = cleanText(payload.decision, 20);
  if (!id || !["accepted", "declined", "cancelled"].includes(decision)) {
    return Response.json({ error: "Buluşma kararı geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const ownerColumn = decision === "cancelled" ? "sender_email" : "recipient_email";
    const updated = await DB.prepare(
      `UPDATE meetup_requests SET status = ?, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND ${ownerColumn} = ? AND status = 'pending' AND datetime(expires_at) > CURRENT_TIMESTAMP
       RETURNING sender_email, recipient_email, activity`,
    ).bind(decision, id, identity.email).first<{ sender_email: string; recipient_email: string; activity: string }>();
    if (!updated) return Response.json({ error: "Yanıtlanabilecek buluşma isteği bulunamadı." }, { status: 404 });
    if (decision !== "cancelled") {
      await notify(DB, {
        userEmail: updated.sender_email,
        actorEmail: identity.email,
        kind: "community",
        title: decision === "accepted" ? "Buluşma isteğin kabul edildi" : "Buluşma isteğin yanıtlandı",
        body: decision === "accepted" ? "Ayrıntıları Buluşmalar alanından görebilirsin." : "Öğrenci bu buluşma isteğini kabul etmedi.",
        entityType: "meetup",
        entityId: id,
      });
    }
    await audit(DB, identity.email, `meetup-request.${decision}`, "meetup", id);
    return Response.json({ status: decision });
  } catch (error) {
    return unavailableResponse(error, "Buluşma isteği şu anda güncellenemedi.");
  }
}
