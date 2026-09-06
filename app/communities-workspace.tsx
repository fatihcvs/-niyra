"use client";

import { nativeFileAccount, shareAppLink } from "../lib/native-files-client";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";
/* eslint-disable @next/next/no-img-element -- authenticated profile media uses dynamic same-origin URLs */

import { type FormEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { BellSlash } from "@phosphor-icons/react/dist/csr/BellSlash";
import { BookOpenText } from "@phosphor-icons/react/dist/csr/BookOpenText";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { Briefcase } from "@phosphor-icons/react/dist/csr/Briefcase";
import { CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { ChatCircle } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { GraduationCap } from "@phosphor-icons/react/dist/csr/GraduationCap";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { LockKey } from "@phosphor-icons/react/dist/csr/LockKey";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Megaphone } from "@phosphor-icons/react/dist/csr/Megaphone";
import { Palette } from "@phosphor-icons/react/dist/csr/Palette";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Prohibit } from "@phosphor-icons/react/dist/csr/Prohibit";
import { Question } from "@phosphor-icons/react/dist/csr/Question";
import { ShareNetwork } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { Trophy } from "@phosphor-icons/react/dist/csr/Trophy";
import { UserMinus } from "@phosphor-icons/react/dist/csr/UserMinus";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { XCircle } from "@phosphor-icons/react/dist/csr/XCircle";
import styles from "./communities-workspace.module.css";

export type CommunityCourse = { id: string; code: string; name: string };

type Community = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  joinPolicy: string;
  rules: string;
  status: string;
  courseId: string | null;
  courseCode: string | null;
  creatorId: string | null;
  creatorName: string;
  memberCount: number;
  postCount: number;
  weeklyPostCount: number;
  eventCount: number;
  lastActive: string;
  joined: boolean;
  pending: boolean;
  role: string | null;
  notificationLevel: string;
  canManage: boolean;
  nextEvent: { title: string; startsAt: string } | null;
};

type Member = {
  publicId: string;
  displayName: string;
  handle: string;
  role: string;
  status: string;
  departmentName: string;
  avatarUrl: string | null;
};

type Ban = { public_id: string; display_name: string; handle: string; reason: string; created_at: string };

type CommunityPost = {
  id: string;
  authorId: string | null;
  authorName: string;
  authorHandle: string;
  departmentName: string;
  avatarUrl: string | null;
  content: string;
  postType: string;
  pinned: boolean;
  own: boolean;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  commentCount: number;
  time: string;
  edited: boolean;
  createdAt: string;
};

type CommentItem = {
  id: string;
  authorName: string;
  initials: string;
  avatarUrl: string | null;
  content: string;
  time: string;
  own: boolean;
};

type CommunityEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
  status: string;
  creatorName: string;
  attendeeCount: number;
  going: boolean;
};

type DirectoryStats = { total: number; joined: number; newThisWeek: number; upcomingEvents: number };
type DetailTab = "feed" | "events" | "members" | "about";
type PostFilter = "all" | "announcement" | "question" | "resource" | "discussion";
type CommunityDraft = { scrolls?: Partial<Record<DetailTab, number>>; tab: DetailTab; postFilter: PostFilter; memberQuery: string; text: string; postType: string; event: { title: string; description: string; location: string; startsAt: string; endsAt: string; capacity: string }; settings?: { description: string; rules: string; joinPolicy: string } };
const emptyEvent = { title: "", description: "", location: "", startsAt: "", endsAt: "", capacity: "" };
const emptyCommunityDraft: CommunityDraft = { tab: "feed", postFilter: "all", memberQuery: "", text: "", postType: "discussion", event: emptyEvent };

const categories = [
  ["", "Tümü"],
  ["akademik", "Akademik"],
  ["teknoloji", "Teknoloji"],
  ["kariyer", "Kariyer"],
  ["sosyal", "Sosyal"],
  ["spor", "Spor"],
  ["sanat", "Sanat"],
  ["kampus", "Kampüs"],
  ["ilgi", "İlgi alanı"],
] as const;

const postTypeLabels: Record<string, string> = {
  discussion: "Sohbet",
  question: "Soru",
  resource: "Kaynak",
  announcement: "Duyuru",
};

const roleLabels: Record<string, string> = {
  founder: "Kurucu",
  admin: "Yönetici",
  moderator: "Moderatör",
  member: "Üye",
};

const dateTime = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });
const eventDay = new Intl.DateTimeFormat("tr-TR", { day: "2-digit" });
const eventMonth = new Intl.DateTimeFormat("tr-TR", { month: "short" });

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "Ü";
}

function categoryLabel(value: string) {
  return categories.find(([key]) => key === value)?.[1] ?? "Topluluk";
}

function CategoryIcon({ category, size = 21 }: { category: string; size?: number }) {
  if (category === "akademik") return <GraduationCap size={size}/>;
  if (category === "teknoloji") return <Code size={size}/>;
  if (category === "kariyer") return <Briefcase size={size}/>;
  if (category === "spor") return <Trophy size={size}/>;
  if (category === "sanat") return <Palette size={size}/>;
  if (category === "kampus") return <Compass size={size}/>;
  if (category === "sosyal") return <UsersThree size={size}/>;
  return <Sparkle size={size}/>;
}

function timeText(value: string) {
  return value === "şimdi" ? value : `${value} önce`;
}

function safeDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function Avatar({ name, image, small = false }: { name: string; image?: string | null; small?: boolean }) {
  return <span className={`${styles.avatar} ${small ? styles.avatarSmall : ""}`}>{image ? <img src={image} alt=""/> : initials(name)}</span>;
}

import { WorkspaceHeader } from "./workspace-ui";
import { createLatestRequest } from "@/lib/latest-request";
import { createCommunityRequests } from "@/lib/community-requests";
import { invalidateProfileContent } from "@/lib/profile-content-state";
import { useWorkspaceState } from "./use-workspace-state";
import { useAppLayer } from "./use-app-layer";
import { AppLink, useAppNavigation } from "./app-navigation";
import { useContentTarget, clearContentTarget } from "./use-content-target";

export function CommunitiesWorkspace({ courses }: { courses: CommunityCourse[] }) {
  const navigation = useAppNavigation();
  return <CommunityWorkspace key={navigation?.ownerScope ?? ""} courses={courses}/>;
}

function CommunityWorkspace({ courses }: { courses: CommunityCourse[] }) {
  const navigation = useAppNavigation();
  const ownerScope = navigation?.ownerScope ?? "";
  const targetCommunityId = useContentTarget("community", "communities");
  const targetEventId = useContentTarget("communityEvent", "communities");
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");
  const [targetRetry, setTargetRetry] = useState(0);
  const [requests] = useState(() => createCommunityRequests({ onSessionExpired: navigation?.onSessionExpired }));
  useEffect(() => requests.attach(), [requests]);
  const [items, setItems] = useState<Community[]>([]);
  const [stats, setStats] = useState<DirectoryStats>({ total: 0, joined: 0, newThisWeek: 0, upcomingEvents: 0 });
  const [directoryState, setDirectoryState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const showError = useCallback((cause: unknown, fallback: string) => { if ((cause as Error)?.name !== "AbortError") setError(cause instanceof Error ? cause.message : fallback); }, []);
  const [query, setQuery] = useWorkspaceState("communities.query", "");
  const [mine, setMine] = useWorkspaceState("communities.mine", false);
  const [category, setCategory] = useWorkspaceState("communities.category", "");
  const [sort, setSort] = useWorkspaceState("communities.sort", "recommended");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useWorkspaceState("communities.create.step", 1);
  const [createData, setCreateData] = useWorkspaceState("communities.create.draft", { name: "", description: "", category: "akademik", joinPolicy: "open", courseId: "", rules: "" });
  const [selected, setSelected] = useWorkspaceState<Community | null>("communities.selected", null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">(selected ? "loading" : "idle");
  const [drafts, setDrafts] = useWorkspaceState<Record<string, CommunityDraft>>("communities.detail.drafts", {});
  const currentDraft = selected ? drafts[selected.id] ?? emptyCommunityDraft : emptyCommunityDraft;
  const updateDraft = useCallback((id: string, patch: Partial<CommunityDraft>) => setDrafts((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => key !== id).slice(-7)), [id]: { ...emptyCommunityDraft, ...current[id], ...patch } })), [setDrafts]);
  const detailTab = currentDraft.tab;
  const setDetailTab = (tab: DetailTab) => { if (selected) updateDraft(selected.id, { tab }); };
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [membersRevision, setMembersRevision] = useState(0);
  const [bans, setBans] = useState<Ban[]>([]);
  const memberQuery = currentDraft.memberQuery;
  const setMemberQuery = (memberQuery: string) => { if (selected) { setMembersLoading(true); setMembersError(""); updateDraft(selected.id, { memberQuery }); } };
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const postFilter = currentDraft.postFilter;
  const setPostFilter = (postFilter: PostFilter) => { if (selected) updateDraft(selected.id, { postFilter }); };
  const draft = currentDraft.text;
  const setDraft = (text: string) => { if (selected) updateDraft(selected.id, { text }); };
  const draftType = currentDraft.postType;
  const setDraftType = (postType: string) => { if (selected) updateDraft(selected.id, { postType }); };
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [eventOpen, setEventOpen] = useState(false);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  function setBusy(value: boolean) { busyRef.current = value; if (value) requests.invalidate(); setBusyState(value); }
  const detailRequest = useRef(createLatestRequest());
  const directoryRequest = useRef(createLatestRequest());
  const initialRequest = useRef<AbortController | null>(null);
  const createdAfterClose = useRef<Community | null>(null);

  const [lastSelected, setLastSelected] = useState(selected);
  const closeDetail = useCallback(() => {
    requests.setTarget(null); setEventOpen(false);
    detailRequest.current.cancel(); initialRequest.current?.abort();
    setSelected(null); setDetailState("idle"); setPosts([]); setMembers([]); setBans([]); setEvents([]); setError("");
    setTargetLoading(false); setTargetError("");
    if (targetCommunityId) clearContentTarget("community", targetCommunityId, "communities");
    if (targetEventId) clearContentTarget("communityEvent", targetEventId, "communities");
  }, [requests, setSelected, targetCommunityId, targetEventId]);
  const { ref: detailRef, close: closeDetailLayer } = useAppLayer({ id: `communities.detail:${selected?.id ?? lastSelected?.id ?? ""}`, open: Boolean(selected) || targetLoading || Boolean(targetError), history: targetCommunityId || targetEventId ? "route" : "layer", onClose: closeDetail, onRestore: () => { if (lastSelected) void openCommunity(lastSelected); } });
  const { ref: createRef, close: closeCreateLayer } = useAppLayer({ id: "communities.create", open: createOpen, onClose: () => setCreateOpen(false), onRestore: () => setCreateOpen(true), busy });
  const { ref: eventRef, close: closeEventLayer } = useAppLayer({ id: `communities.event:${selected?.id ?? lastSelected?.id ?? ""}`, open: eventOpen && Boolean(selected), onClose: () => setEventOpen(false), onRestore: () => setEventOpen(true), busy });

  const loadDirectory = useCallback(async (signal?: AbortSignal) => {
    const request = directoryRequest.current.begin();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (mine) params.set("mine", "1");
    if (category) params.set("category", category);
    if (sort !== "recommended") params.set("sort", sort);
    try {
    const { response, data } = await requests.read<{ communities?: Community[]; stats?: DirectoryStats; error?: string }>(`/api/communities?${params}`, { signal: signal ?? request.signal }, false);
    if (!request.isCurrent() || signal?.aborted) return;
    if (!response.ok || !data.communities) throw new Error(data.error ?? "Topluluklar getirilemedi.");
    setItems(data.communities);
    if (data.stats) setStats(data.stats);
    setDirectoryState("ready");
    } catch (loadError) { if (request.isCurrent() && !signal?.aborted) throw loadError; }
  }, [category, mine, query, sort, requests]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDirectoryState("loading");
      setError("");
      void loadDirectory(controller.signal).catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        showError(loadError, "Topluluklar getirilemedi.");
        setDirectoryState("error");
      });
    }, query ? 240 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [loadDirectory, query, showError]);

  const openCommunity = useCallback(async (community: Community, targetEvent?: CommunityEvent) => {
    initialRequest.current?.abort();
    const request = detailRequest.current.begin();
    requests.setTarget(community.id); setEventOpen(false);
    setSelected(community); setLastSelected(community);
    setDetailState("loading");
    setPosts([]); setMembers([]); setBans([]); setEvents([]); setError("");
    try {
      const [{ response: detailResponse, data: detail }, { response: postsResponse, data: postData }, { response: eventsResponse, data: eventData }] = await Promise.all([
        requests.read<{ community?: Community; members?: Member[]; bans?: Ban[]; error?: string }>(`/api/communities?id=${encodeURIComponent(community.id)}`, { signal: request.signal }),
        requests.read<{ posts?: CommunityPost[]; error?: string }>(`/api/community-posts?communityId=${encodeURIComponent(community.id)}`, { signal: request.signal }),
        requests.read<{ events?: CommunityEvent[]; error?: string }>(`/api/community-events?communityId=${encodeURIComponent(community.id)}`, { signal: request.signal }),
      ]);
      if (!request.isCurrent()) return;
      if (!detailResponse.ok || !detail.community) throw new Error(detail.error ?? "Topluluk açılamadı.");
      // Closed communities intentionally hide feeds from non-members; other errors need a retry.
      if (!postsResponse.ok && postsResponse.status !== 403) throw new Error(postData.error ?? "Topluluk gönderileri yüklenemedi.");
      if (!eventsResponse.ok && eventsResponse.status !== 403) throw new Error(eventData.error ?? "Topluluk etkinlikleri yüklenemedi.");
      setSelected(detail.community);
      setMembers(detail.members ?? []);
      setBans(detail.bans ?? []);
      setPosts(postsResponse.ok ? postData.posts ?? [] : []);
      const listedEvents = eventsResponse.ok ? eventData.events ?? [] : [];
      setEvents(targetEvent ? [targetEvent, ...listedEvents.filter((item) => item.id !== targetEvent.id)] : listedEvents);
      if (targetEvent) updateDraft(community.id, { tab: "events", scrolls: { events: 0 } });
      setDetailState("ready");

    } catch (openError) {
      if (!request.isCurrent() || (openError as Error).name === "AbortError") return;
      showError(openError, "Topluluk açılamadı.");
      setDetailState("error");
    }
  }, [requests, setSelected, showError, updateDraft]);

  useEffect(() => {
    const opened = () => { if (createdAfterClose.current && window.history.state?.kampiraLayer?.id !== "communities.create") { const community = createdAfterClose.current; createdAfterClose.current = null; void openCommunity(community); } };
    window.addEventListener("popstate", opened); return () => window.removeEventListener("popstate", opened);
  }, [openCommunity]);
  const initialSelected = useRef(selected);
  const selectedMemberCommunityId = selected?.joined && detailTab === "members" && detailState === "ready" ? selected.id : null;
  useEffect(() => {
    if (!selectedMemberCommunityId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMembersLoading(true); setMembersError("");
      void requests.read<{ members?: Member[]; error?: string }>(`/api/communities?id=${encodeURIComponent(selectedMemberCommunityId)}&memberQ=${encodeURIComponent(memberQuery)}`, { signal: controller.signal }).then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error ?? "Üyeler yüklenemedi.");
        setMembers(data.members ?? []);
      }).catch((cause) => { if (!controller.signal.aborted && cause?.name !== "AbortError") setMembersError(cause instanceof Error ? cause.message : "Üyeler yüklenemedi."); }).finally(() => { if (!controller.signal.aborted) setMembersLoading(false); });
    }, memberQuery ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [selectedMemberCommunityId, memberQuery, membersRevision, requests]);
  useEffect(() => {
    const detailScope = detailRequest.current;
    const directoryScope = directoryRequest.current;
    const controller = new AbortController();
    initialRequest.current = controller;
    const cached = !targetCommunityId && !targetEventId ? initialSelected.current : null;
    if (!targetCommunityId && !targetEventId && !cached) return;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      if (targetCommunityId || targetEventId) { setSelected(null); setTargetLoading(true); setTargetError(""); }
      try {
        let id = targetCommunityId || cached?.id || "";
        let targetEvent: CommunityEvent | undefined;
        if (targetEventId) {
          const { response, data } = await requests.read<{ communityId?: string; event?: CommunityEvent; error?: string }>(`/api/community-events?id=${encodeURIComponent(targetEventId)}${id ? `&communityId=${encodeURIComponent(id)}` : ""}`, { signal: controller.signal }, false);
          if (!response.ok || !data.communityId || !data.event || data.event.id !== targetEventId) throw new Error(data.error ?? "Etkinlik bulunamadı veya erişim iznin yok.");
          id = data.communityId; targetEvent = data.event;
        }
        requests.setTarget(id);
        const { response, data } = await requests.read<{ community?: Community; error?: string }>(`/api/communities?id=${encodeURIComponent(id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok || !data.community || data.community.id !== id) throw new Error(data.error ?? "Topluluk bulunamadı veya erişim iznin yok.");
        setTargetLoading(false);
        // openCommunity owns the remaining request; do not cancel it through its initial guard.
        initialRequest.current = null;
        await openCommunity(data.community, targetEvent);
      } catch (loadError) {
        if (!controller.signal.aborted && (loadError as Error)?.name !== "AbortError") {
          setTargetLoading(false); setSelected(null); setLastSelected(null);
          setTargetError(loadError instanceof Error ? loadError.message : "Bağlantı açılamadı.");
        }
      }
    });
    return () => { controller.abort(); detailScope.cancel(); directoryScope.cancel(); };
  }, [targetCommunityId, targetEventId, targetRetry, openCommunity, requests, setSelected]);

  async function refreshDirectory() {
    setDirectoryState("loading"); setError("");
    try { await loadDirectory(); }
    catch (loadError) { setDirectoryState("error"); showError(loadError, "Topluluklar getirilemedi."); }
  }

  function patchCommunity(id: string, patch: Partial<Community>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setSelected((current) => current?.id === id ? { ...current, ...patch } : current);
  }

  async function membership(community: Community) {
    if (busyRef.current || community.role === "founder") return;
    const action = community.joined || community.pending ? "leave" : "join";
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ joined?: boolean; pending?: boolean; error?: string }>("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: community.id, action }) });
      if (!response.ok) throw new Error(data.error ?? "Üyelik değiştirilemedi.");
      invalidateProfileContent(ownerScope, undefined, ["communities"]);
      const joined = Boolean(data.joined); const pending = Boolean(data.pending);
      const memberDelta = joined && !community.joined ? 1 : !joined && community.joined ? -1 : 0;
      patchCommunity(community.id, { joined, pending, role: joined ? "member" : null, memberCount: Math.max(0, community.memberCount + memberDelta) });
      if (joined) await openCommunity({ ...community, joined, pending, role: "member", memberCount: community.memberCount + memberDelta });
      else { setMembers([]); if (community.joinPolicy === "request") setPosts([]); }
      void loadDirectory().catch((error) => showError(error, "Üyelik güncellendi; liste yenilenemedi."));
    } catch (membershipError) { showError(membershipError, "Üyelik değiştirilemedi."); }
    finally { setBusy(false); }
  }

  function validateCreateStep() {
    if (createStep === 1 && createData.name.trim().length < 3) return "Topluluk adı en az 3 karakter olmalı.";
    if (createStep === 1 && createData.description.trim().length < 12) return "Topluluğun amacını en az 12 karakterle açıkla.";
    return "";
  }

  async function createCommunity() {
    if (busyRef.current) return;
    const validation = validateCreateStep();
    if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ community?: Community; error?: string }>("/api/communities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createData) });
      if (!response.ok || !data.community) throw new Error(data.error ?? "Topluluk kurulamadı.");
      invalidateProfileContent(ownerScope, undefined, ["communities"]);
      if (window.history.state?.kampiraLayer?.id === "communities.create") createdAfterClose.current = data.community;
      setCreateOpen(false); setCreateStep(1); setCreateData({ name: "", description: "", category: "akademik", joinPolicy: "open", courseId: "", rules: "" });
      void loadDirectory().catch((error) => showError(error, "Topluluk kuruldu; liste yenilenemedi."));
      if (!createdAfterClose.current) await openCommunity(data.community);
    } catch (createError) { showError(createError, "Topluluk kurulamadı."); }
    finally { setBusy(false); }
  }

  async function createPost() {
    if (!selected || !draft.trim() || busyRef.current) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ post?: CommunityPost; error?: string }>("/api/community-posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, content: draft.trim(), postType: draftType }) });
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderi paylaşılamadı.");
      setPosts((current) => [data.post!, ...current]);
      patchCommunity(selected.id, { postCount: selected.postCount + 1, weeklyPostCount: selected.weeklyPostCount + 1, lastActive: "şimdi" });
      setDraft(""); setDraftType("discussion");
      invalidateProfileContent(ownerScope, undefined, ["posts"]);
    } catch (postError) { showError(postError, "Gönderi paylaşılamadı."); }
    finally { setBusy(false); }
  }

  async function managePost(postId: string, action: "pin" | "remove") {
    if (!selected || busyRef.current) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ active?: boolean; removed?: boolean; error?: string }>("/api/community-posts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, postId, action }) });
      if (!response.ok) throw new Error(data.error ?? "Gönderi işlemi tamamlanamadı.");
      if (action === "remove") setPosts((current) => current.filter((post) => post.id !== postId));
      else setPosts((current) => current.map((post) => post.id === postId ? { ...post, pinned: Boolean(data.active) } : post));
    } catch (postError) { showError(postError, "Gönderi işlemi tamamlanamadı."); }
    finally { setBusy(false); }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busyRef.current) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { response, data } = await requests.read<{ event?: CommunityEvent; error?: string }>("/api/community-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, ...Object.fromEntries(form.entries()) }) });
      if (!response.ok || !data.event) throw new Error(data.error ?? "Etkinlik oluşturulamadı.");
      setEvents((current) => [...current, data.event!].sort((left, right) => left.startsAt.localeCompare(right.startsAt)));
      patchCommunity(selected.id, { eventCount: selected.eventCount + 1, nextEvent: selected.nextEvent ?? { title: data.event.title, startsAt: data.event.startsAt } });
      setEventOpen(false); updateDraft(selected.id, { event: emptyEvent, tab: "events" });
    } catch (eventError) { showError(eventError, "Etkinlik oluşturulamadı."); }
    finally { setBusy(false); }
  }

  async function rsvp(target: CommunityEvent) {
    if (!selected || busyRef.current) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ going?: boolean; attendeeCount?: number; error?: string }>("/api/community-events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: target.id, action: "rsvp" }) });
      if (!response.ok) throw new Error(data.error ?? "Katılım durumu değiştirilemedi.");
      setEvents((current) => current.map((item) => item.id === target.id ? { ...item, going: Boolean(data.going), attendeeCount: Number(data.attendeeCount ?? item.attendeeCount) } : item));
    } catch (eventError) { showError(eventError, "Katılım durumu değiştirilemedi."); }
    finally { setBusy(false); }
  }

  async function cancelEvent(target: CommunityEvent) {
    if (busyRef.current || !window.confirm("Bu etkinliği iptal etmek istediğine emin misin?")) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ status?: string; error?: string }>("/api/community-events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: target.id, action: "cancel" }) });
      if (!response.ok) throw new Error(data.error ?? "Etkinlik iptal edilemedi.");
      setEvents((current) => current.map((item) => item.id === target.id ? { ...item, status: "cancelled" } : item));
    } catch (cause) { showError(cause, "Etkinlik iptal edilemedi."); }
    finally { setBusy(false); }
  }

  async function manageMember(target: Member, action: "approve" | "reject" | "remove" | "ban" | "role", role?: string) {
    if (!selected || busyRef.current) return;
    if (["remove", "ban"].includes(action) && !window.confirm(`${target.displayName} için bu işlemi uygulamak istediğine emin misin?`)) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ updated?: boolean; error?: string }>("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action, targetId: target.publicId, role, reason: action === "ban" ? "Topluluk kuralları ihlali" : "" }) });
      if (!response.ok || !data.updated) throw new Error(data.error ?? "Üye işlemi tamamlanamadı.");
      await openCommunity(selected);
    } catch (memberError) { showError(memberError, "Üye işlemi tamamlanamadı."); }
    finally { setBusy(false); }
  }

  async function unban(target: Ban) {
    if (!selected || busyRef.current) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ updated?: boolean; error?: string }>("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "unban", targetId: target.public_id }) });
      if (!response.ok || !data.updated) throw new Error(data.error ?? "Yasak kaldırılamadı.");
      setBans((current) => current.filter((item) => item.public_id !== target.public_id));
    } catch (banError) { showError(banError, "Yasak kaldırılamadı."); }
    finally { setBusy(false); }
  }

  async function updateNotifications(level: string) {
    if (!selected || busyRef.current) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await requests.read<{ level?: string; error?: string }>("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "notification", level }) });
      if (!response.ok) throw new Error(data.error ?? "Bildirim tercihi kaydedilemedi.");
      patchCommunity(selected.id, { notificationLevel: data.level ?? level });
    } catch (cause) { showError(cause, "Bildirim tercihi kaydedilemedi."); }
    finally { setBusy(false); }
  }

  async function updateCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busyRef.current) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const patch = { description: String(form.get("description") ?? ""), rules: String(form.get("rules") ?? ""), joinPolicy: String(form.get("joinPolicy") ?? "open") };
      const { response, data } = await requests.read<{ updated?: boolean; error?: string }>("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "update", ...patch }) });
      if (!response.ok || !data.updated) throw new Error(data.error ?? "Topluluk bilgileri kaydedilemedi.");
      invalidateProfileContent(ownerScope, undefined, ["communities"]);
      patchCommunity(selected.id, patch); updateDraft(selected.id, { settings: undefined });
    } catch (updateError) { showError(updateError, "Topluluk bilgileri kaydedilemedi."); }
    finally { setBusy(false); }
  }

  async function archiveCommunity() {
    if (!selected || busyRef.current || !window.confirm("Topluluğu arşivlemek istediğine emin misin? Yeni katılım ve paylaşımlar durur.")) return;
    setBusy(true);
    try {
      const { response, data } = await requests.read<{ status?: string; error?: string }>("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "archive" }) });
      if (!response.ok) throw new Error(data.error ?? "Topluluk arşivlenemedi.");
      invalidateProfileContent(ownerScope, undefined, ["communities"]);
      closeDetail(); void loadDirectory().catch((cause) => showError(cause, "Topluluk arşivlendi; liste yenilenemedi."));
    } catch (archiveError) { showError(archiveError, "Topluluk arşivlenemedi."); }
    finally { setBusy(false); }
  }

  const filteredPosts = useMemo(() => postFilter === "all" ? posts : posts.filter((post) => post.postType === postFilter), [postFilter, posts]);
  const visibleMembers = useMemo(() => members.filter((member) => !memberQuery.trim() || `${member.displayName} ${member.handle} ${member.departmentName}`.toLocaleLowerCase("tr-TR").includes(memberQuery.trim().toLocaleLowerCase("tr-TR"))), [memberQuery, members]);
  const activeMembers = visibleMembers.filter((member) => member.status === "active");
  const pendingMembers = visibleMembers.filter((member) => member.status === "pending");

  return <div className={styles.workspace} data-scroll-pending={directoryState === "loading"} data-mobile-overlay={createOpen || Boolean(selected) || eventOpen} data-filters-open={mobileFiltersOpen}>
    <WorkspaceHeader screenId="communities" section="Topluluklar" eyebrow="TOPLULUK MERKEZİ" title="Topluluklar" description="Derslerden kulüplere; birlikte üret, etkinliklere katıl ve kampüste bağ kur." primaryAction={{ id: "communities.create", busy, label: "Topluluk kur", icon: <Plus size={22}/>, onPress: () => { setCreateOpen(true); } }} secondaryActions={[{ id: "communities.refresh", label: "İçeriği yenile", busy: directoryState === "loading", onPress: refreshDirectory }]}/>

    {stats.total > 0 && <section className={styles.insights} aria-label="Topluluk özeti">
      <div><span><UsersThree size={21}/></span><strong>{stats.joined}</strong><small>Üye olduğun</small></div>
      <div><span><Sparkle size={21}/></span><strong>{stats.newThisWeek}</strong><small>Bu hafta yeni</small></div>
      <div><span><CalendarDots size={21}/></span><strong>{stats.upcomingEvents}</strong><small>Yaklaşan etkinlik</small></div>
      <div><span><Compass size={21}/></span><strong>{stats.total}</strong><small>Kampüs topluluğu</small></div>
    </section>}

    <section className={styles.directoryToolbar} aria-label="Toplulukları filtrele">
      <div className={styles.directoryTabs} role="tablist" aria-label="Topluluk görünümü">
        <button role="tab" aria-selected={!mine} className={!mine ? styles.active : ""} onClick={() => setMine(false)} type="button">Keşfet</button>
        <button role="tab" aria-selected={mine} className={mine ? styles.active : ""} onClick={() => setMine(true)} type="button">Topluluklarım <span>{stats.joined}</span></button>
      </div>
      <label className={styles.search}><MagnifyingGlass size={19}/><span className={styles.srOnly}>Topluluk ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topluluk, ders veya ilgi alanı ara"/>{query && <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle"><X size={16}/></button>}</label>
      <label className={styles.sort}><span className={styles.srOnly}>Toplulukları sırala</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Sana uygun</option><option value="members">En çok üye</option><option value="new">Yeni kurulan</option></select></label>
      <button className={styles.filterToggle} type="button" aria-label={`Filtreler${category || sort !== "recommended" ? ", etkin filtre var" : ""}`} aria-expanded={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((open) => !open)}><SlidersHorizontal size={22}/>{(category || sort !== "recommended") && <span aria-hidden="true"/>}</button>
    </section>

    <div className={styles.categoryRail} role="group" aria-label="Topluluk kategorileri">{categories.map(([value, label]) => <button type="button" key={value || "all"} className={category === value ? styles.active : ""} aria-pressed={category === value} onClick={() => setCategory(value)}>{value ? <CategoryIcon category={value} size={17}/> : <Compass size={17}/>} {label}</button>)}</div>
    <div className="workspace-result-summary" role="status"><span>{directoryState === "loading" ? "Topluluklar aranıyor…" : `${items.length} topluluk gösteriliyor`}{mine ? " · Üyeliklerin" : ""}</span>{(query || category || mine || sort !== "recommended") && <button type="button" onClick={() => { setQuery(""); setCategory(""); setMine(false); setSort("recommended"); }}>Filtreleri temizle</button>}</div>
    {error && <p className={styles.error} role="alert">{error}<button type="button" onClick={() => void refreshDirectory()}>Yeniden dene</button></p>}

    {directoryState === "loading" && items.length === 0 ? <div className={styles.cardGrid} aria-label="Topluluklar yükleniyor">{[0,1,2,3].map((item) => <div className={styles.skeleton} key={item}/>)}</div> : directoryState === "error" && items.length === 0 ? null : items.length === 0 ? <section className={styles.empty}><Compass size={32}/><h2>{mine ? "Henüz bir topluluğa katılmadın" : query.trim() || category ? "Eşleşen topluluk bulunamadı" : "Kampüsündeki ilk topluluğu kur"}</h2><p>{mine ? "Derslerine ve ilgi alanlarına göre önerilen toplulukları keşfet." : query.trim() || category ? "Farklı bir arama veya kategori seçerek yeniden deneyebilirsin." : "Bir ders çalışma grubu, öğrenci kulübü veya ortak ilgi alanıyla çevreni bir araya getir."}</p><button type="button" onClick={() => { if (mine || query.trim() || category) { setMine(false); setQuery(""); setCategory(""); } else { setCreateOpen(true); } }}>{mine ? "Toplulukları keşfet" : query.trim() || category ? "Filtreleri temizle" : "İlk topluluğu kur"}</button></section> : <section className={styles.cardGrid} aria-label="Topluluklar">
      {items.map((community) => <CommunityCard community={community} key={community.id} busy={busy} onOpen={() => void openCommunity(community)} onMembership={() => void membership(community)}/>) }
    </section>}

    {createOpen && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeCreateLayer(); }}><section className={styles.createDialog} role="dialog" aria-modal="true" aria-labelledby="create-community-title" ref={createRef}>
      <header><div><span>YENİ TOPLULUK · {createStep}/3</span><h2 id="create-community-title">{createStep === 1 ? "Topluluğuna bir kimlik ver" : createStep === 2 ? "Kiminle buluşacağını belirle" : "Son kontrol"}</h2></div><button data-autofocus type="button" onClick={closeCreateLayer} aria-label="Pencereyi kapat"><X size={21}/></button></header>
      <div className={styles.steps} aria-label="Oluşturma adımları"><span className={createStep >= 1 ? styles.complete : ""}/><span className={createStep >= 2 ? styles.complete : ""}/><span className={createStep >= 3 ? styles.complete : ""}/></div>
      {createStep === 1 && <div className={styles.createBody}><label>Topluluk adı<input disabled={busy} value={createData.name} onChange={(event) => setCreateData((current) => ({ ...current, name: event.target.value }))} maxLength={80} placeholder="Örn. Yapay Zekâ Çalışma Grubu"/></label><label>Kısa amaç<textarea disabled={busy} value={createData.description} onChange={(event) => setCreateData((current) => ({ ...current, description: event.target.value }))} maxLength={500} rows={4} placeholder="Üyelerin burada ne yapacağını açıkça anlat."/></label><fieldset><legend>Kategori</legend><div className={styles.categoryPicker}>{categories.slice(1).map(([value,label]) => <button type="button" disabled={busy} key={value} className={createData.category === value ? styles.active : ""} aria-pressed={createData.category === value} onClick={() => setCreateData((current) => ({ ...current, category: value }))}><CategoryIcon category={value}/><span>{label}</span></button>)}</div></fieldset></div>}
      {createStep === 2 && <div className={styles.createBody}><label>Ders bağlantısı<select disabled={busy} value={createData.courseId} onChange={(event) => setCreateData((current) => ({ ...current, courseId: event.target.value }))}><option value="">Genel kampüs topluluğu</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label><fieldset><legend>Katılım biçimi</legend><div className={styles.policyPicker}><button type="button" disabled={busy} className={createData.joinPolicy === "open" ? styles.active : ""} aria-pressed={createData.joinPolicy === "open"} onClick={() => setCreateData((current) => ({ ...current, joinPolicy: "open" }))}><UsersThree size={24}/><strong>Herkese açık</strong><small>Öğrenciler anında katılır.</small></button><button type="button" disabled={busy} className={createData.joinPolicy === "request" ? styles.active : ""} aria-pressed={createData.joinPolicy === "request"} onClick={() => setCreateData((current) => ({ ...current, joinPolicy: "request" }))}><LockKey size={24}/><strong>İstekle katılım</strong><small>Topluluk ekibi onaylar.</small></button></div></fieldset></div>}
      {createStep === 3 && <div className={styles.createBody}><label>Topluluk kuralları<textarea disabled={busy} value={createData.rules} onChange={(event) => setCreateData((current) => ({ ...current, rules: event.target.value }))} maxLength={800} rows={5} placeholder="Saygılı ol, kaynak belirt, kişisel veri paylaşma…"/></label><div className={styles.previewCard}><span><CategoryIcon category={createData.category}/></span><div><small>{categoryLabel(createData.category)}{createData.courseId ? ` · ${courses.find((course) => course.id === createData.courseId)?.code ?? "Ders"}` : ""}</small><strong>{createData.name || "Topluluk adı"}</strong><p>{createData.description || "Topluluğun amacı burada görünecek."}</p></div></div><p className={styles.safetyNote}><ShieldCheck size={19}/> Topluluk yalnızca kendi üniversitendeki öğrencilere görünür. Kurallar ve yönetim işlemleri güvenli kayda alınır.</p></div>}
      {error && <p className={styles.dialogError} role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => createStep === 1 ? closeCreateLayer() : setCreateStep((step) => step - 1)}>{createStep === 1 ? "Vazgeç" : "Geri"}</button>{createStep < 3 ? <button className={styles.primaryButton} type="button" onClick={() => { const validation = validateCreateStep(); if (validation) setError(validation); else { setError(""); setCreateStep((step) => step + 1); } }}>Devam et</button> : <button className={styles.primaryButton} type="button" onClick={() => void createCommunity()} disabled={busy}>{busy ? "Kuruluyor…" : "Topluluğu kur"}</button>}</footer>
    </section></div>}

    {!selected && (targetLoading || targetError) && <div className={styles.overlay} role="presentation"><section className={styles.hubDialog} role="dialog" aria-modal="true" aria-labelledby="community-target-title" ref={detailRef}><header className={styles.hubHero}><h2 id="community-target-title">{targetLoading ? "Bağlantı açılıyor…" : "İçeriğe ulaşılamadı"}</h2><button className={styles.closeButton} type="button" onClick={closeDetailLayer} aria-label="Pencereyi kapat"><X size={21}/></button></header><section className={styles.empty}>{targetLoading ? <p role="status">Topluluk erişimi kontrol ediliyor.</p> : <><p role="alert">{targetError}</p><button type="button" onClick={() => setTargetRetry((value) => value + 1)}>Yeniden dene</button></>}</section></section></div>}
    {selected && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeDetailLayer(); }}><section className={styles.hubDialog} role="dialog" aria-modal="true" aria-labelledby="community-title" ref={detailRef}>
      <header className={`${styles.hubHero} ${styles[`tone_${selected.category}`] ?? ""}`}>
        <button className={styles.mobileBack} data-autofocus type="button" onClick={closeDetailLayer} aria-label="Topluluklardan geri dön"><ArrowLeft size={21}/></button>
        <button className={styles.closeButton} data-autofocus type="button" onClick={closeDetailLayer} aria-label="Pencereyi kapat"><X size={21}/></button>
        <div className={styles.hubMark}><CategoryIcon category={selected.category} size={30}/></div>
        <div className={styles.hubIdentity}><span>{categoryLabel(selected.category)} {selected.courseCode && `· ${selected.courseCode}`}</span><h2 id="community-title">{selected.name}</h2><p>{selected.description}</p><div><span><UsersThree size={16}/>{selected.memberCount} üye</span><span><ChatCircle size={16}/>{selected.postCount} gönderi</span><span><CalendarDots size={16}/>{selected.eventCount} etkinlik</span></div></div>
        <div className={styles.hubActions}>{selected.role === "founder" ? <span className={styles.roleBadge}><ShieldCheck size={17}/> Kurucusun</span> : <button className={selected.joined ? styles.joinedButton : selected.pending ? styles.pendingButton : styles.primaryButton} type="button" onClick={() => void membership(selected)} disabled={busy || detailState !== "ready"}>{selected.joined ? <><Check size={17}/> Katıldın</> : selected.pending ? "İstek gönderildi" : "Topluluğa katıl"}</button>}</div>
      </header>
      <nav className={styles.hubTabs} aria-label="Topluluk bölümleri">{([['feed','Akış'],['events','Etkinlikler'],['members','Üyeler'],['about','Hakkında']] as const).map(([value,label]) => <button type="button" key={value} className={detailTab === value ? styles.active : ""} aria-current={detailTab === value ? "page" : undefined} onClick={() => setDetailTab(value)}>{label}{value === "events" && selected.eventCount > 0 && <span>{selected.eventCount}</span>}{value === "members" && pendingMembers.length > 0 && selected.canManage && <span>{pendingMembers.length}</span>}</button>)}</nav>
      {error && <p className={styles.hubError} role="alert">{error}</p>}
      {detailState === "loading" ? <div className={styles.detailLoading}><span/><span/><span/></div> : detailState === "error" ? <section className={styles.empty}><h3>Topluluk açılamadı</h3><p role="alert">{error}</p><button type="button" onClick={() => void openCommunity(selected)}>Yeniden dene</button></section> : <div className={styles.hubBody} ref={(node) => { if (node) node.scrollTop = currentDraft.scrolls?.[detailTab] ?? 0; }} onScroll={(event) => updateDraft(selected.id, { scrolls: { ...currentDraft.scrolls, [detailTab]: event.currentTarget.scrollTop } })}>
        {detailTab === "feed" && <section className={styles.feedPane}>
          {selected.joined ? <div className={styles.composer}><div className={styles.composerTop}><Avatar name="Sen"/><textarea disabled={busy} aria-label="Topluluğunla paylaşımın" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} rows={3} placeholder="Topluluğunla bir fikir, soru veya kaynak paylaş…"/></div><div className={styles.composerFooter}><div>{([['discussion','Sohbet'],['question','Soru'],['resource','Kaynak'],...(selected.canManage ? [['announcement','Duyuru']] : [])] as string[][]).map(([value,label]) => <button type="button" disabled={busy} className={draftType === value ? styles.active : ""} aria-pressed={draftType === value} key={value} onClick={() => setDraftType(value)}>{value === "question" ? <Question size={16}/> : value === "resource" ? <BookOpenText size={16}/> : value === "announcement" ? <Megaphone size={16}/> : <ChatCircle size={16}/>} {label}</button>)}</div><label className={styles.postTypeSelect}><span className={styles.srOnly}>Paylaşım türü</span><select disabled={busy} value={draftType} onChange={(event) => setDraftType(event.target.value)}><option value="discussion">Sohbet</option><option value="question">Soru</option><option value="resource">Kaynak</option>{selected.canManage && <option value="announcement">Duyuru</option>}</select></label><button className={styles.primaryButton} type="button" onClick={() => void createPost()} disabled={!draft.trim() || busy}><PaperPlaneTilt size={17}/>{busy ? "Paylaşılıyor…" : "Paylaş"}</button></div></div> : <section className={styles.joinPrompt}><UsersThree size={27}/><div><strong>Katkıda bulunmak için topluluğa katıl</strong><p>Gönderi paylaşabilir, etkinliklere katılabilir ve üyeleri görebilirsin.</p></div><button type="button" onClick={() => void membership(selected)}>{selected.pending ? "İstek bekliyor" : "Katıl"}</button></section>}
          <div className={styles.postFilters} role="group" aria-label="Gönderileri filtrele">{([['all','Tümü'],['announcement','Duyurular'],['question','Sorular'],['resource','Kaynaklar']] as const).map(([value,label]) => <button type="button" key={value} className={postFilter === value ? styles.active : ""} aria-pressed={postFilter === value} onClick={() => setPostFilter(value)}>{label}</button>)}</div>
          <div className={styles.feed}>{filteredPosts.length ? filteredPosts.map((post) => <CommunityPostCard key={post.id} post={post} canManage={selected.canManage} onManage={managePost}/>) : <section className={styles.empty}><ChatCircle size={30}/><h3>{!selected.joined && selected.joinPolicy === "request" ? "Paylaşımlar üyelere özel" : postFilter === "all" ? "Henüz paylaşım yok" : `${postTypeLabels[postFilter]} bulunamadı`}</h3><p>{selected.joined ? "İlk anlamlı katkıyı sen başlatabilirsin." : "Topluluğa katıldığında yeni paylaşımlardan haberdar olursun."}</p></section>}</div>
        </section>}
        {detailTab === "events" && <section className={styles.eventsPane}><header><div><h3>Yaklaşan etkinlikler</h3><p>Toplulukla çevrim içi veya kampüste buluş.</p></div>{selected.canManage && <button className={styles.primaryButton} type="button" onClick={() => setEventOpen(true)}><Plus size={17}/> Etkinlik oluştur</button>}</header>{events.length ? <div className={styles.eventList}>{events.map((item) => <EventCard key={item.id} event={item} joined={selected.joined} canManage={selected.canManage} busy={busy} onRsvp={() => void rsvp(item)} onCancel={() => void cancelEvent(item)}/>)}</div> : <section className={styles.empty}><CalendarDots size={32}/><h3>{!selected.joined && selected.joinPolicy === "request" ? "Etkinlikler üyelere özel" : "Planlanmış etkinlik yok"}</h3><p>{selected.canManage ? "İlk çalışma oturumunu, tanışmayı veya kampüs buluşmasını planla." : "Topluluk ekibi yeni bir etkinlik oluşturduğunda burada göreceksin."}</p></section>}</section>}
        {detailTab === "members" && <section className={styles.membersPane}><header><div><h3>Topluluk üyeleri</h3><p>{selected.canManage ? "Katılım isteklerini ve ekip rollerini yönet." : "Birlikte olduğun öğrencileri keşfet."}</p></div><label><MagnifyingGlass size={17}/><span className={styles.srOnly}>Üyelerde ara</span><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Üye ara"/></label></header>{!selected.joined ? <section className={styles.lockedState}><LockKey size={30}/><h3>Üye dizini topluluğa özeldir</h3><p>Üyeleri görmek için katılımın aktif olmalı.</p></section> : <>{selected.canManage && pendingMembers.length > 0 && <section className={styles.memberSection}><h4>Bekleyen istekler <span>{pendingMembers.length}</span></h4><div className={styles.memberGrid}>{pendingMembers.map((member) => <MemberCard member={member} key={member.publicId} busy={busy} canManage onAction={manageMember}/>)}</div></section>}<section className={styles.memberSection}>{membersLoading && <p role="status">Üyeler aranıyor…</p>}{membersError && <p role="alert">{membersError}<button type="button" onClick={() => setMembersRevision((revision) => revision + 1)}>Üyeleri yeniden yükle</button></p>}{!membersLoading && !membersError && memberQuery.trim() && !visibleMembers.length && <p role="status">Aramana uygun üye bulunamadı.</p>}<h4>Üyeler <span>{activeMembers.length}</span></h4><div className={styles.memberGrid}>{activeMembers.map((member) => <MemberCard member={member} key={member.publicId} busy={busy} canManage={selected.canManage} onAction={manageMember}/>)}</div></section>{selected.canManage && bans.length > 0 && <section className={styles.memberSection}><h4>Erişimi sınırlandırılanlar <span>{bans.length}</span></h4><div className={styles.banList}>{bans.map((item) => <article key={item.public_id}><Avatar name={item.display_name}/><div><strong>{item.display_name}</strong><small>@{item.handle}{item.reason && ` · ${item.reason}`}</small></div><button type="button" onClick={() => void unban(item)}>Yasağı kaldır</button></article>)}</div></section>}</>}</section>}
        {detailTab === "about" && <section className={styles.aboutPane}><div className={styles.aboutMain}><section><span>TOPLULUK HAKKINDA</span><h3>{selected.description}</h3><dl><div><dt>Kurucu</dt><dd>{selected.creatorId ? <AppLink href={`/?profile=${encodeURIComponent(selected.creatorId)}`}>{selected.creatorName}</AppLink> : selected.creatorName}</dd></div><div><dt>Katılım</dt><dd>{selected.joinPolicy === "open" ? "Herkese açık" : "İstekle katılım"}</dd></div><div><dt>Son hareket</dt><dd>{timeText(selected.lastActive)}</dd></div></dl></section><section><span>TOPLULUK KURALLARI</span>{selected.rules ? <ol>{selected.rules.split(/\n+/).filter(Boolean).map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ol> : <p>Kurucu henüz özel bir kural eklememiş. Kampira güvenlik ve saygı kuralları geçerlidir.</p>}</section></div>{selected.joined && <section className={styles.notificationSettings}><div>{selected.notificationLevel === "mute" ? <BellSlash size={22}/> : <Bell size={22}/>}<span><strong>Topluluk bildirimleri</strong><small>Bu topluluktan ne sıklıkta haber almak istediğini seç.</small></span></div><select disabled={busy} aria-label="Topluluk bildirim tercihi" value={selected.notificationLevel} onChange={(event) => void updateNotifications(event.target.value)}><option value="all">Tüm paylaşımlar</option><option value="announcements">Yalnızca duyuru ve etkinlikler</option><option value="mute">Sessiz</option></select></section>}{['founder','admin'].includes(selected.role ?? "") && <form className={styles.managementSettings} onSubmit={updateCommunity} onChange={(event) => { const form = new FormData(event.currentTarget); updateDraft(selected.id, { settings: { description: String(form.get("description") ?? ""), rules: String(form.get("rules") ?? ""), joinPolicy: String(form.get("joinPolicy") ?? "open") } }); }}><header><ShieldCheck size={22}/><div><strong>Topluluk ayarları</strong><small>Yöneticilere özel</small></div></header><label>Açıklama<textarea name="description" defaultValue={currentDraft.settings?.description ?? selected.description} minLength={12} maxLength={500} rows={4}/></label><label>Kurallar<textarea name="rules" defaultValue={currentDraft.settings?.rules ?? selected.rules} maxLength={800} rows={4}/></label><label>Katılım<select name="joinPolicy" defaultValue={currentDraft.settings?.joinPolicy ?? selected.joinPolicy}><option value="open">Herkese açık</option><option value="request">İstekle katılım</option></select></label><footer><button className={styles.dangerButton} type="button" onClick={() => void archiveCommunity()}>Topluluğu arşivle</button><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></footer></form>}</section>}
      </div>}
    </section></div>}

    {eventOpen && selected && <div className={`${styles.overlay} ${styles.nestedOverlay}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEventLayer(); }}><form className={styles.eventDialog} role="dialog" aria-modal="true" aria-labelledby="event-create-title" onSubmit={createEvent} onChange={(event) => updateDraft(selected.id, { event: Object.fromEntries(new FormData(event.currentTarget).entries()) as CommunityDraft["event"] })} ref={eventRef as RefObject<HTMLFormElement>}><header><div><span>TOPLULUK ETKİNLİĞİ</span><h2 id="event-create-title">Yeni buluşma planla</h2></div><button data-autofocus type="button" onClick={closeEventLayer} aria-label="Pencereyi kapat"><X size={21}/></button></header><div><label>Etkinlik adı<input disabled={busy} name="title" defaultValue={currentDraft.event.title} minLength={3} maxLength={100} required placeholder="Örn. Final öncesi soru çözümü"/></label><label>Açıklama<textarea disabled={busy} name="description" defaultValue={currentDraft.event.description} minLength={12} maxLength={700} rows={4} required placeholder="Kimler katılabilir ve etkinlikte ne yapılacak?"/></label><label>Yer<input disabled={busy} name="location" defaultValue={currentDraft.event.location} minLength={3} maxLength={120} required placeholder="Örn. Merkez Kütüphane, 2. kat"/></label><div className={styles.formRow}><label>Başlangıç<input disabled={busy} name="startsAt" defaultValue={currentDraft.event.startsAt} type="datetime-local" required/></label><label>Bitiş<input disabled={busy} name="endsAt" defaultValue={currentDraft.event.endsAt} type="datetime-local"/></label></div><label>Kontenjan <small>isteğe bağlı</small><input disabled={busy} name="capacity" defaultValue={currentDraft.event.capacity} type="number" min="2" max="5000" placeholder="Sınırsız"/></label><p className={styles.safetyNote}><MapPin size={19}/> Ev adresi yerine kampüs içindeki güvenli, ortak bir alan yaz.</p></div>{error && <p className={styles.dialogError} role="alert">{error}</p>}<footer><button type="button" onClick={closeEventLayer}>Vazgeç</button><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Oluşturuluyor…" : "Etkinliği oluştur"}</button></footer></form></div>}
  </div>;
}

function CommunityCard({ community, busy, onOpen, onMembership }: { community: Community; busy: boolean; onOpen: () => void; onMembership: () => void }) {
  return <article className={styles.communityCard}>
    <button className={`${styles.cardCover} ${styles[`tone_${community.category}`] ?? ""}`} type="button" onClick={onOpen} aria-label={`${community.name} topluluğunu aç`}><span><CategoryIcon category={community.category} size={27}/></span><small>{community.courseCode ?? categoryLabel(community.category)}</small>{community.weeklyPostCount > 0 && <i><Sparkle size={13}/> Bu hafta {community.weeklyPostCount} yeni</i>}</button>
    <div className={styles.cardBody}><button className={styles.cardTitle} type="button" onClick={onOpen}><span>{categoryLabel(community.category)}{community.joinPolicy === "request" && <i><LockKey size={13}/> Onaylı</i>}</span><h2>{community.name}</h2><p>{community.description}</p></button>{community.nextEvent && <button className={styles.nextEvent} type="button" onClick={onOpen}><CalendarDots size={18}/><span><small>Yaklaşan</small><strong>{community.nextEvent.title}</strong></span><time>{dateTime.format(safeDate(community.nextEvent.startsAt))}</time></button>}<div className={styles.cardMeta}><div className={styles.avatarStack}><span>{initials(community.creatorName)}</span><span><UsersThree size={14}/></span></div><span><strong>{community.memberCount}</strong> üye</span><span><strong>{community.postCount}</strong> gönderi</span><span><Clock size={14}/>{timeText(community.lastActive)}</span></div><div className={styles.cardActions}><button type="button" onClick={onOpen}>Topluluğu aç</button>{community.role === "founder" ? <span><ShieldCheck size={16}/> Kurucusun</span> : <button className={community.joined ? styles.joinedButton : community.pending ? styles.pendingButton : styles.primaryButton} type="button" disabled={busy} onClick={onMembership}>{community.joined ? <><Check size={16}/> Katıldın</> : community.pending ? "İstek gönderildi" : "Katıl"}</button>}</div></div>
  </article>;
}

function CommunityPostCard({ post, canManage, onManage }: { post: CommunityPost; canManage: boolean; onManage: (postId: string, action: "pin" | "remove") => Promise<void> }) {
  const navigation = useAppNavigation();
  const shareTransport = useAuthenticatedFetch();
  const shareController = useRef<AbortController | null>(null);
  useEffect(() => () => shareController.current?.abort(), []);
  const [requests] = useState(() => createCommunityRequests({ onSessionExpired: navigation?.onSessionExpired }));
  useEffect(() => requests.attach(), [requests]);
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [commentDraft, setCommentDraft] = useWorkspaceState(`communities.comment:${post.id}`, "");
  const [reportDraft, setReportDraft] = useWorkspaceState(`communities.report:${post.id}`, { reason: "spam", details: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportState, setReportState] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const commentsRequest = useRef(createLatestRequest());
  const { ref: reportRef, close: closeReport } = useAppLayer({ id: `communities.report:${post.id}`, open: reportOpen, onClose: () => setReportOpen(false), onRestore: () => setReportOpen(true), busy });
  const showError = (cause: unknown) => { if ((cause as Error).name !== "AbortError") setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı. Yeniden deneyebilirsin."); };

  async function interaction(type: "like" | "save" | "comment", content?: string) {
    const { response, data } = await requests.read<{ active?: boolean; count?: number; comment?: CommentItem; error?: string }>("/api/post-actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId: post.id, type, content }) });
    if (!response.ok) throw new Error(data.error ?? "Etkileşim kaydedilemedi.");
    return data;
  }
  async function toggleLike() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    try { const data = await interaction("like"); setLiked(Boolean(data.active)); setLikeCount(Number(data.count ?? likeCount)); navigation?.onPostInteraction?.(post.id, { liked: Boolean(data.active), likes: Number(data.count ?? likeCount) }); }
    catch (cause) { showError(cause); } finally { busyRef.current = false; setBusy(false); }
  }
  async function toggleSave() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    try { const data = await interaction("save"); setSaved(Boolean(data.active)); navigation?.onPostInteraction?.(post.id, { saved: Boolean(data.active) }); }
    catch (cause) { showError(cause); } finally { busyRef.current = false; setBusy(false); }
  }
  async function loadComments() {
    const request = commentsRequest.current.begin(); setCommentsState("loading"); setError("");
    try {
      const { response, data } = await requests.read<{ comments?: CommentItem[]; error?: string }>(`/api/comments?postId=${encodeURIComponent(post.id)}`, { signal: request.signal });
      if (!request.isCurrent()) return;
      if (!response.ok) throw new Error(data.error ?? "Yorumlar yüklenemedi.");
      setComments(data.comments ?? []); setCommentsState("ready");
    } catch (cause) { if (request.isCurrent()) { showError(cause); setCommentsState("error"); } }
  }
  function toggleComments() {
    const next = !commentsOpen; setCommentsOpen(next);
    if (!next) { commentsRequest.current.cancel(); if (commentsState === "loading") setCommentsState("idle"); }
    else if (commentsState !== "ready") void loadComments();
  }
  async function sendComment() {
    const clean = commentDraft.trim(); if (!clean || busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); commentsRequest.current.cancel();
    try { const data = await interaction("comment", clean); if (!data.comment) throw new Error("Yorum kaydı doğrulanamadı."); setComments((current) => [...current, data.comment!]); setCommentCount(Number(data.count ?? commentCount + 1)); setCommentDraft(""); setCommentsState("ready"); navigation?.onPostInteraction?.(post.id, { comments: Number(data.count ?? commentCount + 1) }); }
    catch (cause) { showError(cause); } finally { busyRef.current = false; setBusy(false); }
  }
  async function share() {
    shareController.current?.abort();
    const controller = new AbortController(); shareController.current = controller;
    const check = shareTransport.beginResponseCheck(controller.signal);
    const url = new URL(`/?post=${encodeURIComponent(post.id)}`, window.location.origin);
    try { const result = await shareAppLink(nativeFileAccount(navigation?.ownerScope), { title: "Kampira topluluk gönderisi", text: post.content, url: url.toString() }, controller.signal); if (result === "copied" && check.isCurrent()) setReportState("Gönderi bağlantısı kopyalandı."); }
    catch (cause) { if (check.isCurrent() && (cause as Error).name !== "AbortError") showError(cause); }
  }
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busyRef.current || reportState === "Şikâyetin inceleme kuyruğuna alındı.") return;
    busyRef.current = true; setBusy(true); setReportState(""); setError("");
    try {
      const { response, data } = await requests.read<{ error?: string }>("/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report", entityType: "post", entityId: post.id, ...reportDraft }) });
      if (!response.ok) throw new Error(data.error ?? "Şikâyet gönderilemedi.");
      setReportState("Şikâyetin inceleme kuyruğuna alındı."); setReportDraft({ reason: "spam", details: "" });
    } catch (cause) { showError(cause); } finally { busyRef.current = false; setBusy(false); }
  }

  return <article data-mobile-overlay={reportOpen} className={`${styles.postCard} ${post.pinned ? styles.pinnedPost : ""}`}>
    {post.pinned && <div className={styles.pinLabel}><Megaphone size={15}/> Öne çıkan {postTypeLabels[post.postType]?.toLocaleLowerCase("tr-TR")}</div>}
    <header><Avatar name={post.authorName} image={post.avatarUrl}/><div>{post.authorId ? <AppLink href={`/?profile=${encodeURIComponent(post.authorId)}`}>{post.authorName}</AppLink> : <strong>{post.authorName}</strong>}<span>@{post.authorHandle} · {post.departmentName}</span><small>{timeText(post.time)}{post.edited && " · düzenlendi"}</small></div><div className={styles.postMenu}><button type="button" aria-label="Gönderi seçenekleri" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><DotsThree size={21}/></button>{menuOpen && <div role="menu">{canManage && <><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void onManage(post.id, "pin"); }}>{post.pinned ? "Öne çıkarmayı kaldır" : "Öne çıkar"}</button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void onManage(post.id, "remove"); }}>Gönderiyi kaldır</button></>}<button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setReportState(""); setError(""); setReportOpen(true); }}>Şikâyet et</button></div>}</div></header>
    <div className={styles.postContent}><span className={`${styles.postType} ${styles[`postType_${post.postType}`] ?? ""}`}>{post.postType === "question" ? <Question size={14}/> : post.postType === "resource" ? <BookOpenText size={14}/> : post.postType === "announcement" ? <Megaphone size={14}/> : <ChatCircle size={14}/>} {postTypeLabels[post.postType] ?? "Sohbet"}</span><p>{post.content}</p></div>
    <footer><div><button className={liked ? styles.active : ""} type="button" onClick={() => void toggleLike()} aria-pressed={liked} disabled={busy} aria-label={liked ? "Beğeniyi kaldır" : "Gönderiyi beğen"}><Heart size={19} weight={liked ? "fill" : "regular"}/><span>{likeCount}</span></button><button type="button" onClick={() => void toggleComments()} aria-expanded={commentsOpen} aria-label={`Yorumları göster, ${commentCount} yorum`}><ChatCircle size={19}/><span>{commentCount}</span></button><button type="button" onClick={() => void share()}><ShareNetwork size={19}/><span>Paylaş</span></button></div><button className={saved ? styles.active : ""} type="button" onClick={() => void toggleSave()} aria-pressed={saved} disabled={busy} aria-label={saved ? "Kaydedilenlerden kaldır" : "Gönderiyi kaydet"}><BookmarkSimple size={19} weight={saved ? "fill" : "regular"}/></button></footer>
    {error && !reportOpen && <p role="alert" className={styles.hubError}>{error}</p>}
    {commentsOpen && <section className={styles.comments} aria-label="Gönderi yorumları">{commentsState === "loading" ? <p>Yorumlar getiriliyor…</p> : commentsState === "error" ? <button type="button" onClick={() => void loadComments()}>Yorumları yeniden yükle</button> : comments.length ? comments.map((comment) => <article key={comment.id}><Avatar name={comment.authorName} image={comment.avatarUrl} small/><div><strong>{comment.authorName}</strong><small>{timeText(comment.time)}</small><p>{comment.content}</p></div></article>) : <p>İlk yorumu sen bırak.</p>}<div><input aria-label="Yorumun" disabled={busy} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={500} placeholder="Bir yorum yaz…" onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void sendComment(); } }}/><button type="button" onClick={() => void sendComment()} disabled={!commentDraft.trim() || busy} aria-label="Yorumu gönder"><PaperPlaneTilt size={18}/></button></div></section>}
    {reportOpen && <div className={`${styles.overlay} ${styles.nestedOverlay}`} role="presentation"><form className={styles.reportDialog} role="dialog" aria-modal="true" aria-label="Gönderiyi şikâyet et" ref={reportRef as RefObject<HTMLFormElement>} onSubmit={report}><header><strong>Gönderiyi şikâyet et</strong><button type="button" onClick={closeReport} aria-label="Şikâyet alanını kapat"><X size={17}/></button></header><select name="reason" aria-label="Şikâyet nedeni" value={reportDraft.reason} onChange={(event) => setReportDraft((current) => ({ ...current, reason: event.target.value }))}><option value="spam">Spam</option><option value="harassment">Taciz veya zorbalık</option><option value="privacy">Kişisel veri</option><option value="misinformation">Yanıltıcı içerik</option><option value="other">Diğer</option></select><textarea name="details" aria-label="Şikâyet açıklaması" value={reportDraft.details} onChange={(event) => setReportDraft((current) => ({ ...current, details: event.target.value }))} maxLength={800} rows={3} placeholder="İncelemeye yardımcı olacak ayrıntı"/><button type="submit" disabled={busy || reportState === "Şikâyetin inceleme kuyruğuna alındı."}>{busy ? "Gönderiliyor…" : "Şikâyeti gönder"}</button>{error && <p role="alert">{error}</p>}{reportState && <p role="status">{reportState}</p>}</form></div>}
  </article>;
}

function EventCard({ event, joined, canManage, busy, onRsvp, onCancel }: { event: CommunityEvent; joined: boolean; canManage: boolean; busy: boolean; onRsvp: () => void; onCancel: () => void }) {
  const start = safeDate(event.startsAt);
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}/${safeDate(event.endsAt ?? new Date(start.getTime() + 60 * 60_000).toISOString()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}`;
  return <article className={`${styles.eventCard} ${event.status === "cancelled" ? styles.cancelled : ""}`}><time><strong>{eventDay.format(start)}</strong><span>{eventMonth.format(start)}</span></time><div><span>{dateTime.format(start)}{event.status === "cancelled" && " · İptal edildi"}</span><h4>{event.title}</h4><p>{event.description}</p><small><MapPin size={15}/>{event.location}</small><small><UsersThree size={15}/>{event.attendeeCount}{event.capacity ? ` / ${event.capacity}` : ""} katılımcı</small></div><footer>{event.status === "active" && <>{joined && <button className={event.going ? styles.joinedButton : styles.primaryButton} type="button" onClick={onRsvp} disabled={busy}>{event.going ? <><CheckCircle size={17}/> Katılıyorsun</> : "Katılacağım"}</button>}<a href={calendarUrl} target="_blank" rel="noreferrer"><CalendarDots size={17}/> Takvime ekle</a>{canManage && <button className={styles.dangerButton} type="button" onClick={onCancel}>İptal et</button>}</>}</footer></article>;
}

function MemberCard({ member, canManage, onAction, busy }: { member: Member; canManage: boolean; busy: boolean; onAction: (target: Member, action: "approve" | "reject" | "remove" | "ban" | "role", role?: string) => Promise<void> }) {
  return <article className={styles.memberCard}><Avatar name={member.displayName} image={member.avatarUrl}/><div><AppLink href={`/?profile=${encodeURIComponent(member.publicId)}`}>{member.displayName}</AppLink><span>@{member.handle}</span><small>{member.departmentName}</small></div><em>{member.status === "pending" ? "Onay bekliyor" : roleLabels[member.role] ?? member.role}</em>{canManage && member.role !== "founder" && <div className={styles.memberActions}>{member.status === "pending" ? <><button type="button" disabled={busy} onClick={() => void onAction(member, "approve")} aria-label={`${member.displayName} katılımını onayla`}><Check size={17}/></button><button type="button" disabled={busy} onClick={() => void onAction(member, "reject")} aria-label={`${member.displayName} katılımını reddet`}><XCircle size={17}/></button></> : <><select disabled={busy} value={member.role} onChange={(event) => void onAction(member, "role", event.target.value)} aria-label={`${member.displayName} rolü`}><option value="member">Üye</option><option value="moderator">Moderatör</option><option value="admin">Yönetici</option></select><button type="button" disabled={busy} onClick={() => void onAction(member, "remove")} aria-label={`${member.displayName} üyeliğini kaldır`}><UserMinus size={17}/></button><button type="button" disabled={busy} onClick={() => void onAction(member, "ban")} aria-label={`${member.displayName} erişimini sınırlandır`}><Prohibit size={17}/></button></>}</div>}</article>;
}
