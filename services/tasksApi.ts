import type { Task } from "../types";
import { getPosApiBaseUrl } from "./posBackendApi";

type ApiTaskRow = {
  id: number;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  deadline: string | null;
  sort_index: number;
  responded_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const mapRowToTask = (row: ApiTaskRow): Task => ({
  id: String(row.id),
  title: String(row.title ?? ""),
  assignee: String(row.assignee ?? "Unassigned"),
  status: row.status as any,
  priority: row.priority as any,
  deadline: row.deadline ? String(row.deadline).slice(0, 10) : "",
  sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
  respondedAt: row.responded_at ? String(row.responded_at) : undefined,
  completedAt: row.completed_at ? String(row.completed_at) : undefined,
  createdAt: row.created_at ? String(row.created_at) : undefined,
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
});

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  const baseUrl = getPosApiBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`POS API ${res.status} for ${path}${msg ? `: ${msg}` : ""}`);
  }
  return res.json();
}

export async function fetchTasksFromApi(): Promise<Task[]> {
  const json = await fetchJson("/api/tasks");
  const rows = Array.isArray((json as any)?.rows) ? (json as any).rows : [];
  return rows.map((r: any) => mapRowToTask(r as ApiTaskRow));
}

export async function createTaskInApi(task: Omit<Task, "id">): Promise<string> {
  const json = await fetchJson("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: task.title,
      assignee: task.assignee,
      status: task.status,
      priority: task.priority,
      deadline: task.deadline ? task.deadline : null,
      sort_index: Number.isFinite(task.sortIndex) ? task.sortIndex : 0,
    }),
  });
  const id = (json as any)?.row?.id;
  if (id === null || id === undefined) throw new Error("Task create did not return id");
  return String(id);
}

export async function updateTaskInApi(id: string, patch: Partial<Task>): Promise<void> {
  const body: any = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.assignee !== undefined) body.assignee = patch.assignee;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.deadline !== undefined) body.deadline = patch.deadline ? patch.deadline : "";
  if (patch.sortIndex !== undefined) body.sort_index = patch.sortIndex;

  await fetchJson(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
