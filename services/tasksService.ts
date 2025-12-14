import type { Task } from "../types";
import { TaskStatus } from "../types";
import { checkPosBackendHealthy } from "./posBackendApi";
import { createTaskInApi, fetchTasksFromApi, updateTaskInApi } from "./tasksApi";

export type Unsubscribe = () => void;

const LOCAL_STORAGE_KEY = "fyrbndist.tasks.v1";
const BROADCAST_CHANNEL = "fyrbndist.tasks";
const LOCAL_CHANGE_EVENT = "fyrbndist:tasks-changed";

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const normalizeTask = (task: Task): Task => {
  const sortIndex = Number.isFinite(task.sortIndex) ? task.sortIndex : 0;
  return {
    ...task,
    assignee: String(task.assignee || "Unassigned"),
    deadline: String(task.deadline || ""),
    sortIndex,
    createdAt: task.createdAt ? String(task.createdAt) : undefined,
    respondedAt: task.respondedAt ? String(task.respondedAt) : undefined,
    completedAt: task.completedAt ? String(task.completedAt) : undefined,
    updatedAt: task.updatedAt ? String(task.updatedAt) : undefined,
  };
};

const sortTasks = (tasks: Task[]) =>
  [...tasks].sort((a, b) => {
    const aStatus = String(a.status);
    const bStatus = String(b.status);
    if (aStatus !== bStatus) return aStatus.localeCompare(bStatus);
    const aIdx = Number.isFinite(a.sortIndex) ? (a.sortIndex as number) : 0;
    const bIdx = Number.isFinite(b.sortIndex) ? (b.sortIndex as number) : 0;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return String(a.id).localeCompare(String(b.id));
  });

const readLocalTasks = (): Task[] => {
  const parsed = safeJsonParse<Task[]>(localStorage.getItem(LOCAL_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return sortTasks(parsed.map(normalizeTask));
};

const writeLocalTasks = (tasks: Task[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sortTasks(tasks.map(normalizeTask))));
};

const nextSortIndexForStatus = (tasks: Task[], status: TaskStatus) => {
  const max = tasks
    .filter((t) => t.status === status)
    .reduce((acc, t) => Math.max(acc, Number.isFinite(t.sortIndex) ? (t.sortIndex as number) : -1), -1);
  return max + 1;
};

const subscribeLocalTasks = (onTasks: (tasks: Task[]) => void): Unsubscribe => {
  onTasks(readLocalTasks());

  const onStorage = (e: StorageEvent) => {
    if (e.key !== LOCAL_STORAGE_KEY) return;
    onTasks(readLocalTasks());
  };

  const onLocalChange = () => onTasks(readLocalTasks());

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.onmessage = () => onTasks(readLocalTasks());
  } catch {
    bc = null;
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange as EventListener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange as EventListener);
    if (bc) bc.close();
  };
};

export type TasksSyncMode = "POS_DB" | "LOCAL_STORAGE";

export const subscribeTasks = (onTasks: (tasks: Task[]) => void, onMode?: (mode: TasksSyncMode) => void): Unsubscribe => {
  let stopped = false;
  let intervalId: number | null = null;
  let localUnsub: Unsubscribe | null = null;

  const startLocal = () => {
    onMode?.("LOCAL_STORAGE");
    localUnsub = subscribeLocalTasks(onTasks);
  };

  const startApi = async () => {
    onMode?.("POS_DB");
    try {
      const tasks = await fetchTasksFromApi();
      if (!stopped) onTasks(sortTasks(tasks.map(normalizeTask)));
    } catch (err) {
      console.error("Failed to load tasks from POS backend:", err);
      if (!stopped) startLocal();
      return;
    }

    intervalId = window.setInterval(async () => {
      try {
        const tasks = await fetchTasksFromApi();
        if (!stopped) onTasks(sortTasks(tasks.map(normalizeTask)));
      } catch {
        // Keep last-known tasks; polling will try again next tick.
      }
    }, 2500);
  };

  void (async () => {
    const ok = await checkPosBackendHealthy();
    if (stopped) return;
    if (ok) void startApi();
    else startLocal();
  })();

  return () => {
    stopped = true;
    if (intervalId !== null) window.clearInterval(intervalId);
    if (localUnsub) localUnsub();
  };
};

export const createTask = async (task: Omit<Task, "id">): Promise<string> => {
  const normalized: Omit<Task, "id"> = normalizeTask({ ...(task as Task), id: "tmp" });
  const payload = { ...normalized } as any;
  delete payload.id;

  try {
    return await createTaskInApi(payload);
  } catch (err) {
    console.warn("Create task via POS backend failed; falling back to local storage:", err);
  }

  const tasks = readLocalTasks();
  const id = String(Date.now());
  const nowIso = new Date().toISOString();
  writeLocalTasks([...tasks, { ...payload, id, createdAt: payload.createdAt ?? nowIso, updatedAt: nowIso }]);

  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ type: "changed" });
    bc.close();
  } catch {
    // ignore
  }

  return id;
};

export const updateTask = async (id: string, patch: Partial<Task>) => {
  if (!id) return;

  try {
    await updateTaskInApi(id, patch);
    return;
  } catch (err) {
    console.warn("Update task via POS backend failed; falling back to local storage:", err);
  }

  const tasks = readLocalTasks();
  const nowIso = new Date().toISOString();
  const next = tasks.map((t) => {
    if (t.id !== id) return t;
    const nextStatus = patch.status ?? t.status;
    const respondedAt =
      nextStatus === TaskStatus.IN_PROGRESS && !t.respondedAt ? nowIso : patch.respondedAt ?? t.respondedAt;
    const completedAt =
      nextStatus === TaskStatus.DONE
        ? nowIso
        : nextStatus === TaskStatus.TODO || nextStatus === TaskStatus.IN_PROGRESS
          ? ""
          : patch.completedAt ?? t.completedAt;
    return normalizeTask({
      ...t,
      ...patch,
      id,
      respondedAt,
      completedAt: completedAt || undefined,
      updatedAt: nowIso,
    });
  });
  writeLocalTasks(next);

  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ type: "changed" });
    bc.close();
  } catch {
    // ignore
  }
};

export const getNextSortIndex = (tasks: Task[], status: TaskStatus) => nextSortIndexForStatus(tasks, status);

export const seedLocalTasksIfEmpty = (seedTasks: Task[]) => {
  const existing = readLocalTasks();
  if (existing.length) return;

  const nowIso = new Date().toISOString();
  const perStatusCount: Record<string, number> = {};
  const seeded = seedTasks.map((t) => {
    const key = String(t.status);
    const idx = perStatusCount[key] ?? 0;
    perStatusCount[key] = idx + 1;
    return normalizeTask({ ...t, sortIndex: idx, createdAt: nowIso, updatedAt: nowIso });
  });

  writeLocalTasks(seeded);
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ type: "changed" });
    bc.close();
  } catch {
    // ignore
  }
};
