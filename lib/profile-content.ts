import type { PostMedia } from "./post-media";

export type ProfileContentTab = "posts" | "images" | "videos" | "notes" | "communities";

export type ProfilePost = {
  audience?: "campus" | "platform";
  id: string;
  authorId?: string;
  name: string;
  initials: string;
  avatarClass: string;
  avatarUrl: string | null;
  school: string;
  department: string;
  time: string;
  course: string;
  text: string;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
  edited: boolean;
  media: PostMedia[];
};

export type ProfileNote = {
  id: string;
  title: string;
  description: string;
  courseCode: string;
  courseName: string;
  noteType: string;
  status: string;
  createdAt: string;
  time: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  pageCount: number | null;
  fileUrl: string;
  saveCount: number;
  own: boolean;
};

export type ProfileCommunity = {
  id: string;
  name: string;
  description: string;
  category: string;
  joinPolicy: string;
  memberCount: number;
  joined: boolean;
  pending: boolean;
  role: string | null;
  courseCode: string | null;
};

export type ProfileContentResponse = {
  posts: ProfilePost[];
  notes: ProfileNote[];
  communities: ProfileCommunity[];
  nextCursor: string | null;
};
