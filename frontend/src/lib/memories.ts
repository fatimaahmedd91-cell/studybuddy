// Memories: types and calls to the API (backend/app/memories.py).
import { ApiError, get, getToken, query, send } from "./api";
import type { MiniProfile } from "./types";

export type MemoryAudience = "friends" | "everyone" | "only_me";

// What each audience means, in the words the website shows. Change the wording here.
export const AUDIENCES: { value: MemoryAudience; label: string; hint: string }[] = [
  { value: "friends", label: "Friends", hint: "Only your Meetkat friends can see it." },
  { value: "everyone", label: "Everyone on Meetkat", hint: "Anyone logged in to Meetkat can see it." },
  { value: "only_me", label: "Only me", hint: "A private memory just for you." },
];

export const MAX_PHOTOS = 4;

export type Memory = {
  id: number;
  author: MiniProfile;
  caption: string;
  audience: MemoryAudience;
  created_at: string;
  updated_at: string;
  edited: boolean;
  // Signed links that work for about an hour. Reload the feed to get fresh ones.
  photos: { url: string }[];
  reaction_count: number;
  reacted_by_me: boolean;
  comment_count: number;
  mine: boolean;
};

export type MemoryComment = {
  id: number;
  body: string;
  created_at: string;
  author: MiniProfile;
  mine: boolean;
  can_delete: boolean;
};

export type MemoryPage = { memories: Memory[]; next_before_id: number | null };

export const memoriesApi = {
  list: (params: { before_id?: number; author_id?: number } = {}) => get<MemoryPage>(`/api/memories${query(params)}`),
  get: (id: number) => get<Memory>(`/api/memories/${id}`),
  update: (id: number, changes: { caption?: string; audience?: MemoryAudience }) =>
    send<Memory>("PATCH", `/api/memories/${id}`, changes),
  remove: (id: number) => send<{ deleted: boolean }>("DELETE", `/api/memories/${id}`),
  react: (id: number) => send<{ reaction_count: number; reacted_by_me: boolean }>("POST", `/api/memories/${id}/reaction`),
  unreact: (id: number) => send<{ reaction_count: number; reacted_by_me: boolean }>("DELETE", `/api/memories/${id}/reaction`),
  comments: (id: number) => get<MemoryComment[]>(`/api/memories/${id}/comments`),
  addComment: (id: number, body: string) => send<MemoryComment>("POST", `/api/memories/${id}/comments`, { body }),
  deleteComment: (id: number, commentId: number) =>
    send<{ deleted: boolean }>("DELETE", `/api/memories/${id}/comments/${commentId}`),
};

// Posting uses XMLHttpRequest instead of fetch, because only XMLHttpRequest reports upload
// progress. onProgress gets a number from 0 to 100.
export function createMemory(
  memory: { caption: string; audience: MemoryAudience; photos: string[] },
  onProgress: (percent: number) => void,
): Promise<Memory> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/memories");
    xhr.setRequestHeader("Content-Type", "application/json");
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { detail?: unknown } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as unknown as Memory);
      const detail = body?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail) && detail[0]?.msg
            ? String(detail[0].msg)
            : `Your memory wasn't posted (error ${xhr.status}). Please try again.`;
      reject(new ApiError(message, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Can't reach the server. Your memory wasn't posted.", 0));
    xhr.send(JSON.stringify(memory));
  });
}
