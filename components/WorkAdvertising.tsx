import React, { useMemo, useState } from "react";
import { Copy, Lock, MoveRight, Plus, Wand2 } from "lucide-react";
import type { SocialPost } from "../types";
import { PostStatus } from "../types";
import { INITIAL_POSTS } from "../constants";
import { rewriteSocialPost } from "../services/geminiService";

type Platform = SocialPost["platform"];

const PLATFORM_STYLES: Record<Platform, { badge: string; dot: string; short: string }> = {
  Instagram: { badge: "bg-pink-100 text-pink-700 border-pink-200", dot: "bg-pink-500", short: "IG" },
  Facebook: { badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-600", short: "FB" },
  Google: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-600", short: "G" },
  Pinterest: { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-600", short: "P" },
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const isoToYmd = (iso?: string) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return ymd(new Date(ms));
};

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, delta: number) => new Date(d.getFullYear(), d.getMonth() + delta, 1);

const calendarGridStart = (month: Date) => {
  const first = startOfMonth(month);
  const day = first.getDay(); // 0..6 (Sun..Sat)
  const diffToMonday = (day + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - diffToMonday);
  return gridStart;
};

const isLocked = (post: SocialPost) => {
  if (!post.scheduledAt) return false;
  const t = new Date(post.scheduledAt).getTime();
  if (!Number.isFinite(t)) return false;
  const now = Date.now();
  const deltaMs = t - now;
  return deltaMs >= 0 && deltaMs <= 48 * 60 * 60 * 1000;
};

const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const seedScheduleDemo = (posts: SocialPost[]) => {
  const today = new Date();
  return posts.map((p, idx) => {
    if (p.scheduledAt && isoToYmd(p.scheduledAt)) return p;
    // Demo: seed the first few posts onto the calendar, leave the rest unscheduled.
    if (idx >= 3) return { ...p, scheduledAt: "" };
    const d = new Date(today);
    d.setDate(today.getDate() + idx + 2);
    d.setHours(10, 0, 0, 0);
    return { ...p, scheduledAt: d.toISOString() };
  });
};

const WorkAdvertising: React.FC = () => {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedYmd, setSelectedYmd] = useState<string>(() => ymd(new Date()));
  const [posts, setPosts] = useState<SocialPost[]>(() => seedScheduleDemo(INITIAL_POSTS));

  const [clipboard, setClipboard] = useState<SocialPost | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPost = useMemo(() => (editingId ? posts.find((p) => p.id === editingId) ?? null : null), [editingId, posts]);
  const [draftContent, setDraftContent] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const postsForSelectedDay = useMemo(() => {
    const list = posts.filter((p) => isoToYmd(p.scheduledAt) === selectedYmd);
    return [...list].sort((a, b) => String(a.platform).localeCompare(String(b.platform)) || a.id.localeCompare(b.id));
  }, [posts, selectedYmd]);

  const unscheduledDrafts = useMemo(() => {
    const list = posts.filter((p) => !isoToYmd(p.scheduledAt));
    return [...list].sort((a, b) => String(a.platform).localeCompare(String(b.platform)) || a.id.localeCompare(b.id));
  }, [posts]);

  const dayCounts = useMemo(() => {
    const m = new Map<string, Record<Platform, number>>();
    for (const p of posts) {
      const day = isoToYmd(p.scheduledAt);
      if (!day) continue;
      const cur = m.get(day) ?? { Instagram: 0, Facebook: 0, Google: 0, Pinterest: 0 };
      cur[p.platform] = (cur[p.platform] ?? 0) + 1;
      m.set(day, cur);
    }
    return m;
  }, [posts]);

  const openEditor = (id: string) => {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setDraftContent(p.content);
    setAiPrompt("");
  };

  const saveEditor = () => {
    if (!editingPost) return;
    if (isLocked(editingPost)) return;
    setPosts((prev) => prev.map((p) => (p.id === editingPost.id ? { ...p, content: draftContent } : p)));
    setEditingId(null);
  };

  const handleAiRewrite = async () => {
    if (!editingPost) return;
    if (isLocked(editingPost)) return;
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const suggestion = await rewriteSocialPost(draftContent, aiPrompt);
      setDraftContent(suggestion);
      setAiPrompt("");
    } catch (err) {
      console.error("AI Error", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const setScheduledDay = (postId: string, targetYmd: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (isLocked(p)) return p;
        const base = p.scheduledAt && Number.isFinite(new Date(p.scheduledAt).getTime()) ? new Date(p.scheduledAt) : new Date();
        const [yy, mm, dd] = targetYmd.split("-").map((n) => Number(n));
        const next = new Date(base);
        next.setFullYear(yy);
        next.setMonth(mm - 1);
        next.setDate(dd);
        if (!p.scheduledAt) next.setHours(10, 0, 0, 0);
        return { ...p, scheduledAt: next.toISOString() };
      })
    );
  };

  const unschedulePost = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (isLocked(p)) return p;
        return { ...p, scheduledAt: "" };
      })
    );
  };

  const scheduleToSelectedDay = (postId: string) => setScheduledDay(postId, selectedYmd);

  const duplicateToDay = (post: SocialPost, targetYmd: string) => {
    const [yy, mm, dd] = targetYmd.split("-").map((n) => Number(n));
    const next = new Date();
    next.setFullYear(yy);
    next.setMonth(mm - 1);
    next.setDate(dd);
    next.setHours(10, 0, 0, 0);
    const cloned: SocialPost = {
      ...post,
      id: newId(),
      status: PostStatus.DRAFT,
      scheduledAt: next.toISOString(),
    };
    setPosts((prev) => [...prev, cloned]);
  };

  const createBlankForDay = (targetYmd: string) => {
    const [yy, mm, dd] = targetYmd.split("-").map((n) => Number(n));
    const next = new Date();
    next.setFullYear(yy);
    next.setMonth(mm - 1);
    next.setDate(dd);
    next.setHours(10, 0, 0, 0);
    const post: SocialPost = {
      id: newId(),
      platform: "Instagram",
      content: "",
      imagePlaceholder: "https://picsum.photos/420/280",
      status: PostStatus.DRAFT,
      author: "Marketing Team",
      scheduledAt: next.toISOString(),
    };
    setPosts((prev) => [...prev, post]);
    setSelectedYmd(targetYmd);
    openEditor(post.id);
  };

  const createUnscheduledDraft = () => {
    const post: SocialPost = {
      id: newId(),
      platform: "Instagram",
      content: "",
      imagePlaceholder: "https://picsum.photos/420/280",
      status: PostStatus.DRAFT,
      author: "Marketing Team",
      scheduledAt: "",
    };
    setPosts((prev) => [...prev, post]);
    openEditor(post.id);
  };

  const gridDays = useMemo(() => {
    const start = calendarGridStart(month);
    return Array.from({ length: 42 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Work Advertising</h2>
          <p className="text-slate-500">
            Plan Facebook, Instagram, and Google posts on a calendar. Posts scheduled within 48 hours are locked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Month</div>
              <div className="text-lg font-semibold text-slate-900">
                {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
            </div>
            <div className="text-xs text-slate-500">Drag posts to reschedule (unless locked).</div>
          </div>

          <div className="grid grid-cols-7 border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-3 py-2 border-r last:border-r-0 border-slate-200">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.map((d) => {
              const dayKey = ymd(d);
              const inMonth = d.getMonth() === month.getMonth();
              const isSelected = dayKey === selectedYmd;
              const counts = dayCounts.get(dayKey);

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setSelectedYmd(dayKey)}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain") || draggingId;
                    if (!id) return;
                    setScheduledDay(id, dayKey);
                    setDraggingId(null);
                  }}
                  className={`h-28 border-t border-r border-slate-200 last:border-r-0 px-3 py-2 text-left transition-colors ${
                    isSelected ? "bg-blue-50" : "bg-white hover:bg-slate-50"
                  } ${inMonth ? "" : "opacity-60"}`}
                  title={dayKey}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-sm font-semibold ${inMonth ? "text-slate-900" : "text-slate-500"}`}>{d.getDate()}</div>
                    {clipboard && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateToDay(clipboard, dayKey);
                        }}
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        title="Paste copied post to this day"
                      >
                        Paste
                      </button>
                    )}
                  </div>

                  {counts && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(Object.keys(PLATFORM_STYLES) as Platform[]).map((p) => {
                        const n = counts[p] ?? 0;
                        if (!n) return null;
                        const s = PLATFORM_STYLES[p];
                        return (
                          <span
                            key={p}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${s.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                            {s.short} {n}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Selected day</div>
                <div className="text-lg font-semibold text-slate-900">{selectedYmd}</div>
              </div>
              <button
                type="button"
                onClick={() => createBlankForDay(selectedYmd)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                <Plus size={16} />
                New
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {postsForSelectedDay.length === 0 ? (
                <div className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-4">
                  No posts planned for this day. Click New to draft one, or paste a copied post.
                </div>
              ) : (
                postsForSelectedDay.map((p) => {
                  const locked = isLocked(p);
                  const s = PLATFORM_STYLES[p.platform];
                  return (
                    <div
                      key={p.id}
                      draggable={!locked}
                      onDragStart={(e) => {
                        if (locked) return;
                        setDraggingId(p.id);
                        e.dataTransfer.setData("text/plain", p.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={`border rounded-lg p-4 ${locked ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${s.badge}`}>{p.platform}</span>
                            {locked && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <Lock size={12} /> Locked
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap line-clamp-4">{p.content || "(empty draft)"}</div>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <button
                            type="button"
                            onClick={() => setClipboard(p)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
                            title="Copy this post to paste on another day"
                          >
                            <Copy size={12} />
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => unschedulePost(p.id)}
                            disabled={locked}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            title={locked ? "Locked within 48 hours" : "Move back to Unscheduled Drafts"}
                          >
                            Unscheduled
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditor(p.id)}
                            disabled={locked}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            title={locked ? "Locked within 48 hours" : "Edit this post"}
                          >
                            <Wand2 size={12} />
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
                        <span>{p.author}</span>
                        <span className="inline-flex items-center gap-2">
                          <span className="hidden sm:inline">Drag</span>
                          <MoveRight size={12} />
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {clipboard && (
              <div className="mt-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                Copied: <span className="font-medium">{clipboard.platform}</span>. Use Paste on any day in the calendar.
                <button
                  type="button"
                  onClick={() => setClipboard(null)}
                  className="ml-2 text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Unscheduled drafts</div>
                <div className="text-lg font-semibold text-slate-900">{unscheduledDrafts.length}</div>
              </div>
              <button
                type="button"
                onClick={createUnscheduledDraft}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
              >
                <Plus size={16} />
                New draft
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {unscheduledDrafts.length === 0 ? (
                <div className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-4">
                  No unscheduled drafts. Create one, then drag it onto a calendar day.
                </div>
              ) : (
                unscheduledDrafts.slice(0, 12).map((p) => {
                  const s = PLATFORM_STYLES[p.platform];
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(p.id);
                        e.dataTransfer.setData("text/plain", p.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className="border border-slate-200 rounded-lg p-4 bg-white"
                      title="Drag onto the calendar to schedule"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${s.badge}`}>{p.platform}</span>
                            <span className="text-xs text-slate-500 truncate">{p.author}</span>
                          </div>
                          <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap line-clamp-3">{p.content || "(empty draft)"}</div>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <button
                            type="button"
                            onClick={() => scheduleToSelectedDay(p.id)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
                            title="Schedule to selected day"
                          >
                            <MoveRight size={12} />
                            Schedule
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditor(p.id)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
                            title="Edit this draft"
                          >
                            <Wand2 size={12} />
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {unscheduledDrafts.length > 12 && (
                <div className="text-xs text-slate-500">Showing 12 drafts. Drag-and-drop still works from the list.</div>
              )}
            </div>
          </div>

          {editingPost && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-500">Editor</div>
                  <div className="text-lg font-semibold text-slate-900">{editingPost.platform}</div>
                  {isLocked(editingPost) && (
                    <div className="mt-1 text-xs text-slate-500 inline-flex items-center gap-1">
                      <Lock size={12} /> Locked within 48 hours of scheduled time.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  disabled={isLocked(editingPost)}
                  rows={6}
                  placeholder="Write the post text here…"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                />

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-slate-700 mb-2">AI recommendation</div>
                  <div className="flex gap-2">
                    <input
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      disabled={isLocked(editingPost) || isGenerating}
                      placeholder='Example: "Make it shorter and more direct"'
                      className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAiRewrite()}
                      disabled={isLocked(editingPost) || isGenerating || !aiPrompt.trim()}
                      className="px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-sm disabled:opacity-50"
                    >
                      Suggest
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Generates an improved version you can still edit before saving.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditor}
                    disabled={isLocked(editingPost)}
                    className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkAdvertising;
