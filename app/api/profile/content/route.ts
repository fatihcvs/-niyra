import { hydratePostMedia } from "../../../../lib/post-media";
import { profileMediaUrl } from "../../../../lib/profile";
import type { ProfileContentResponse, ProfileContentTab, ProfilePost } from "../../../../lib/profile-content";
import {
  getRuntime,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../../lib/server-api";

const PAGE_SIZE = 12;
const tabs: ProfileContentTab[] = ["posts", "images", "videos", "notes", "communities"];
type Cursor = { createdAt: string; id: string };
type PageRow = { id: string; created_at: string };
type PostRow = PageRow & {
  author_id: string | null;
  display_name: string;
  university_name: string;
  department_name: string;
  content: string;
  audience: "campus" | "platform";
  updated_at: string;
  course_code: string | null;
  avatar_updated_at: string | null;
  like_count: number;
  comment_count: number;
  liked: number;
  saved: number;
};
type NoteRow = PageRow & {
  title: string;
  description: string;
  course_code: string;
  course_name: string;
  note_type: string;
  status: string;
  original_file_name: string;
  content_type: string;
  byte_size: number;
  page_count: number | null;
  save_count: number;
};
type CommunityRow = PageRow & {
  name: string;
  description: string;
  category: string;
  join_policy: string;
  member_count: number;
  membership_status: string | null;
  role: string | null;
  course_code: string | null;
};

function page<T extends PageRow>(rows: T[]) {
  const items = rows.slice(0, PAGE_SIZE);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > PAGE_SIZE && last ? `${last.created_at}::${last.id}` : null };
}

async function readPosts(
  DB: D1Database,
  viewerEmail: string,
  authorEmail: string,
  universityId: string,
  tab: ProfileContentTab,
  cursor: Cursor | null,
): Promise<Pick<ProfileContentResponse, "posts" | "nextCursor">> {
  const mediaKind = tab === "images" ? "image" : tab === "videos" ? "video" : "";
  const result = await DB.prepare(`
    SELECT p.id, p.audience, p.content, p.created_at, p.updated_at,
      u.public_id AS author_id, u.display_name,
      un.name AS university_name, d.name AS department_name, cr.code AS course_code,
      (SELECT pm.updated_at FROM profile_media pm WHERE pm.user_email = u.email AND pm.kind = 'avatar' LIMIT 1) AS avatar_updated_at,
      (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND pc.deleted_at IS NULL) AS comment_count,
      EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_email = ?) AS liked,
      EXISTS (SELECT 1 FROM post_saves ps WHERE ps.post_id = p.id AND ps.user_email = ?) AS saved
    FROM posts p
    JOIN users u ON u.email = p.author_email
    JOIN student_profiles sp ON sp.user_email = p.author_email
    JOIN universities un ON un.id = sp.university_id
    JOIN departments d ON d.id = sp.department_id
    LEFT JOIN courses cr ON cr.id = p.course_id
    WHERE p.author_email = ? AND p.deleted_at IS NULL AND (sp.university_id = ? OR (p.audience = 'platform' AND p.community_id IS NULL AND p.course_id IS NULL))
      AND (? = '' OR EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.kind = ?))
      AND (p.community_id IS NULL OR EXISTS (
        SELECT 1 FROM communities c WHERE c.id = p.community_id
          AND c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active'
          AND (c.join_policy = 'open' OR EXISTS (
            SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_email = ? AND cm.status = 'active'
          ))
          AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ?)
      ))
      AND (? = '' OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?
  `).bind(
    viewerEmail, viewerEmail, authorEmail, universityId, mediaKind, mediaKind,
    universityId, viewerEmail, viewerEmail,
    cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.id ?? "", PAGE_SIZE + 1,
  ).all<PostRow>();
  const { items, nextCursor } = page(result.results);
  const media = await hydratePostMedia(DB, items.map((row) => row.id));
  const posts: ProfilePost[] = items.map((row) => ({
    id: row.id,
    audience: row.audience,
    authorId: row.author_id ?? undefined,
    name: row.display_name,
    initials: row.display_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "Ü",
    avatarClass: "avatar-violet",
    avatarUrl: profileMediaUrl(row.author_id, "avatar", row.avatar_updated_at),
    school: row.university_name,
    department: row.department_name,
    time: relativeTime(row.created_at),
    course: row.course_code ?? "KAMPÜS",
    text: row.content,
    likes: Number(row.like_count),
    comments: Number(row.comment_count),
    liked: Boolean(row.liked),
    saved: Boolean(row.saved),
    edited: row.updated_at !== row.created_at,
    media: media.get(row.id) ?? [],
  }));
  return { posts, nextCursor };
}

async function readNotes(DB: D1Database, viewerEmail: string, authorEmail: string, cursor: Cursor | null) {
  const result = await DB.prepare(`
    SELECT n.id, n.title, n.description, n.note_type, n.status, n.created_at,
      n.original_file_name, n.content_type, n.byte_size, n.page_count,
      c.code AS course_code, c.name AS course_name,
      (SELECT COUNT(*) FROM note_saves ns WHERE ns.note_id = n.id) AS save_count
    FROM notes n JOIN courses c ON c.id = n.course_id
    WHERE n.owner_email = ? AND n.deleted_at IS NULL
      AND (n.status = 'published' OR n.owner_email = ?)
      AND (? = '' OR n.created_at < ? OR (n.created_at = ? AND n.id < ?))
    ORDER BY n.created_at DESC, n.id DESC LIMIT ?
  `).bind(authorEmail, viewerEmail, cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.id ?? "", PAGE_SIZE + 1).all<NoteRow>();
  const { items, nextCursor } = page(result.results);
  return {
    notes: items.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      courseCode: row.course_code,
      courseName: row.course_name,
      noteType: row.note_type,
      status: row.status,
      createdAt: row.created_at,
      time: relativeTime(row.created_at),
      originalFileName: row.original_file_name,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      pageCount: row.page_count === null ? null : Number(row.page_count),
      fileUrl: `/api/notes/file?id=${encodeURIComponent(row.id)}`,
      saveCount: Number(row.save_count),
      own: viewerEmail === authorEmail,
    })),
    nextCursor,
  };
}

async function readCommunities(DB: D1Database, viewerEmail: string, authorEmail: string, universityId: string, cursor: Cursor | null) {
  const result = await DB.prepare(`
    SELECT c.id, c.name, c.description, c.category, c.join_policy, member.created_at,
      cr.code AS course_code, viewer.status AS membership_status, viewer.role,
      (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count
    FROM community_members member
    JOIN communities c ON c.id = member.community_id
    LEFT JOIN courses cr ON cr.id = c.course_id
    LEFT JOIN community_members viewer ON viewer.community_id = c.id AND viewer.user_email = ?
    WHERE member.user_email = ? AND member.status = 'active'
      AND c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active'
      AND (c.join_policy = 'open' OR viewer.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ?)
      AND (? = '' OR member.created_at < ? OR (member.created_at = ? AND c.id < ?))
    ORDER BY member.created_at DESC, c.id DESC LIMIT ?
  `).bind(viewerEmail, authorEmail, universityId, viewerEmail, cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.id ?? "", PAGE_SIZE + 1).all<CommunityRow>();
  const { items, nextCursor } = page(result.results);
  return {
    communities: items.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      joinPolicy: row.join_policy,
      memberCount: Number(row.member_count),
      joined: row.membership_status === "active",
      pending: row.membership_status === "pending",
      role: row.role,
      courseCode: row.course_code,
    })),
    nextCursor,
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Profil içeriklerini görmek için giriş yapmalısın.");
  const url = new URL(request.url);
  const publicId = url.searchParams.get("user")?.trim() ?? "";
  const tab = url.searchParams.get("tab") ?? "posts";
  if (publicId.length > 80 || !tabs.includes(tab as ProfileContentTab)) {
    return Response.json({ error: "Profil bölümü geçerli değil." }, { status: 400 });
  }
  const rawCursor = url.searchParams.get("cursor");
  let cursor: Cursor | null = null;
  if (rawCursor) {
    const parts = rawCursor.split("::");
    const [createdAt, id] = parts;
    if (parts.length !== 2 || !createdAt || createdAt.length > 40 || !Number.isFinite(Date.parse(createdAt)) || !id || id.length > 80) {
      return Response.json({ error: "Profil imleci geçerli değil." }, { status: 400 });
    }
    cursor = { createdAt, id };
  }

  try {
    const { DB } = await getRuntime();
    const viewer = await requireProfile(DB, identity.email);
    if (!viewer) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const author = await DB.prepare(`
      SELECT u.email, sp.university_id FROM users u JOIN student_profiles sp ON sp.user_email = u.email
      WHERE u.public_id = ? AND (sp.university_id = ? OR EXISTS (SELECT 1 FROM posts public_post WHERE public_post.author_email = u.email AND public_post.audience = 'platform' AND public_post.community_id IS NULL AND public_post.course_id IS NULL AND public_post.deleted_at IS NULL)) AND sp.onboarding_completed = 1 AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_email = ? AND b.blocked_email = u.email)
             OR (b.blocker_email = u.email AND b.blocked_email = ?)
        ) LIMIT 1
    `).bind(publicId || viewer.public_id, viewer.university_id, identity.email, identity.email).first<{ email: string; university_id: string }>();
    if (!author) return Response.json({ error: "Öğrenci profili bulunamadı." }, { status: 404 });

    const content: ProfileContentResponse = { posts: [], notes: [], communities: [], nextCursor: null };
    if (tab === "notes" && author.university_id === viewer.university_id) Object.assign(content, await readNotes(DB, identity.email, author.email, cursor));
    else if (tab === "notes") return Response.json(content, { headers: { "Cache-Control": "private, no-store" } });
    else if (tab === "communities") Object.assign(content, await readCommunities(DB, identity.email, author.email, viewer.university_id, cursor));
    else Object.assign(content, await readPosts(DB, identity.email, author.email, viewer.university_id, tab as ProfileContentTab, cursor));
    return Response.json(content, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return unavailableResponse(error, "Profil içeriklerine şu anda ulaşılamıyor.");
  }
}
