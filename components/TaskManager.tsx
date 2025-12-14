import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Clock, Plus, User } from "lucide-react";
import { INITIAL_TASKS } from "../constants";
import type { Task } from "../types";
import { TaskStatus } from "../types";
import {
  createTask,
  getNextSortIndex,
  seedLocalTasksIfEmpty,
  subscribeTasks,
  updateTask,
} from "../services/tasksService";

type ColumnId = TaskStatus | "OVERDUE";

const Columns: Array<{ id: ColumnId; label: string; icon: React.ReactNode; droppable: boolean }> = [
  { id: TaskStatus.TODO, label: "To Do", icon: <Circle size={18} className="text-slate-500" />, droppable: true },
  { id: TaskStatus.IN_PROGRESS, label: "In Progress", icon: <Clock size={18} className="text-blue-500" />, droppable: true },
  { id: "OVERDUE", label: "Overdue", icon: <AlertCircle size={18} className="text-red-500" />, droppable: false },
];

const isOverdue = (task: Task) => {
  if (!task.deadline) return false;
  if (task.status === TaskStatus.DONE) return false;
  const d = new Date(`${task.deadline}T23:59:59`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

const getPriorityColor = (p: Task["priority"]) => {
  switch (p) {
    case "high":
      return "bg-red-100 text-red-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    case "low":
      return "bg-blue-100 text-blue-700";
  }
};

const tasksInColumn = (tasks: Task[], columnId: ColumnId) => {
  const open = tasks.filter((t) => t.status !== TaskStatus.DONE);

  const filtered =
    columnId === "OVERDUE"
      ? open.filter((t) => isOverdue(t))
      : open.filter((t) => t.status === columnId && !isOverdue(t));

  return filtered.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0) || a.id.localeCompare(b.id));
};

const parseIsoMs = (iso?: string) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const formatDuration = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const TaskManager: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);

  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("medium");
  const [addError, setAddError] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(
    () => (detailsTaskId ? tasks.find((t) => t.id === detailsTaskId) ?? null : null),
    [detailsTaskId, tasks]
  );
  const [detailsDueDate, setDetailsDueDate] = useState("");

  const [syncMode, setSyncMode] = useState("Checking local DB…");
  const [completedOpen, setCompletedOpen] = useState(true);

  useEffect(() => {
    seedLocalTasksIfEmpty(INITIAL_TASKS);
    return subscribeTasks(setTasks, (mode) => {
      setSyncMode(mode === "POS_DB" ? "Local DB (Postgres)" : "Local only (this browser)");
    });
  }, []);

  useEffect(() => {
    if (!selectedTask) return;
    setDetailsDueDate(selectedTask.deadline || "");
  }, [selectedTask]);

  const applyStatusChangeOptimistic = (taskId: string, nextStatus: TaskStatus, nextSortIndex: number) => {
    const nowIso = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const respondedAt = nextStatus === TaskStatus.IN_PROGRESS ? t.respondedAt ?? nowIso : t.respondedAt;
        const completedAt =
          nextStatus === TaskStatus.DONE ? nowIso : nextStatus === TaskStatus.TODO || nextStatus === TaskStatus.IN_PROGRESS ? undefined : t.completedAt;
        return {
          ...t,
          status: nextStatus,
          sortIndex: nextSortIndex,
          respondedAt,
          completedAt,
          updatedAt: nowIso,
        };
      })
    );
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    const sortIndex = getNextSortIndex(tasks, status);
    applyStatusChangeOptimistic(taskId, status, sortIndex);
    await updateTask(taskId, { status, sortIndex });
  };

  const addTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    const assignee = newTaskAssignee.trim() ? newTaskAssignee.trim() : "Unassigned";
    const status = TaskStatus.TODO;
    const sortIndex = getNextSortIndex(tasks, status);
    const nowIso = new Date().toISOString();

    setAddError(null);
    try {
      const id = await createTask({
        title,
        assignee,
        deadline: "",
        status,
        priority: newTaskPriority,
        sortIndex,
        createdAt: nowIso,
      });
      setTasks((prev) => [
        ...prev,
        { id, title, assignee, deadline: "", status, priority: newTaskPriority, sortIndex, createdAt: nowIso, updatedAt: nowIso },
      ]);

      setNewTaskTitle("");
      setNewTaskAssignee("");
      setNewTaskPriority("medium");
      setIsAdding(false);
    } catch (err) {
      console.error("Failed to create task:", err);
      setAddError("Couldn’t save task. If the POS backend isn’t running, tasks will only save in this browser.");
    }
  };

  const onDropToColumn = async (status: TaskStatus, taskId: string | null) => {
    if (!taskId) return;
    const sortIndex = getNextSortIndex(tasks, status);
    applyStatusChangeOptimistic(taskId, status, sortIndex);
    await updateTask(taskId, { status, sortIndex });
    setDragOverStatus(null);
    setDraggingId(null);
  };

  const saveDueDate = async () => {
    if (!selectedTask) return;
    setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, deadline: detailsDueDate || "" } : t)));
    await updateTask(selectedTask.id, { deadline: detailsDueDate || "" });
    setDetailsTaskId(null);
  };

  const completedTasks = useMemo(() => {
    const rows = tasks.filter((t) => t.status === TaskStatus.DONE);
    return [...rows].sort((a, b) => {
      const aMs = parseIsoMs(a.completedAt) ?? 0;
      const bMs = parseIsoMs(b.completedAt) ?? 0;
      if (aMs !== bMs) return bMs - aMs;
      return (b.sortIndex ?? 0) - (a.sortIndex ?? 0);
    });
  }, [tasks]);

  const completionStats = useMemo(() => {
    const responseMs: number[] = [];
    const completionMs: number[] = [];

    for (const t of completedTasks) {
      const created = parseIsoMs(t.createdAt);
      const responded = parseIsoMs(t.respondedAt);
      const completed = parseIsoMs(t.completedAt);
      if (created !== null && responded !== null && responded >= created) responseMs.push(responded - created);
      if (created !== null && completed !== null && completed >= created) completionMs.push(completed - created);
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      responseCount: responseMs.length,
      completionCount: completionMs.length,
      avgResponseMs: avg(responseMs),
      avgCompletionMs: avg(completionMs),
    };
  }, [completedTasks]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Task Board</h2>
          <p className="text-slate-500">Add tasks, drag them between stages, and track completion.</p>
          <p className="text-xs text-slate-400 mt-1">{syncMode}</p>
        </div>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
        >
          <Plus size={18} className="mr-2" />
          Add Task
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3 animate-fade-in">
          {addError && (
            <div className="md:col-span-5 bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-2 text-sm">
              {addError}
            </div>
          )}
          <input
            type="text"
            placeholder="What needs to be done?"
            className="md:col-span-2 border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <input
            type="text"
            placeholder="Assignee (optional)"
            className="border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            value={newTaskAssignee}
            onChange={(e) => setNewTaskAssignee(e.target.value)}
          />
          <select
            value={newTaskPriority}
            onChange={(e) => setNewTaskPriority(e.target.value as Task["priority"])}
            className="border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div className="flex gap-2 md:justify-end">
            <button onClick={addTask} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-md">
              Save
            </button>
            <button onClick={() => setIsAdding(false)} className="text-slate-500 px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-6 min-w-[1000px] h-full pb-4">
          {Columns.map((col) => {
            const colTasks = tasksInColumn(tasks, col.id);
            const isDragOver = col.droppable && dragOverStatus === col.id;
            return (
              <div
                key={col.id}
                className={`flex-1 rounded-xl p-4 flex flex-col h-full transition-colors ${
                  isDragOver ? "bg-blue-100 ring-2 ring-blue-300" : "bg-slate-100"
                }`}
                onDragOver={(e) => {
                  if (!col.droppable) return;
                  e.preventDefault();
                  setDragOverStatus(col.id as TaskStatus);
                }}
                onDragLeave={() => {
                  if (!col.droppable) return;
                  setDragOverStatus((s) => (s === col.id ? null : s));
                }}
                onDrop={(e) => {
                  if (!col.droppable) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || draggingId;
                  void onDropToColumn(col.id as TaskStatus, id || null);
                }}
              >
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2 font-semibold text-slate-700">
                    {col.icon}
                    {col.label}
                  </div>
                  <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                  {colTasks.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(task.id);
                        e.dataTransfer.setData("text/plain", task.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverStatus(null);
                      }}
                      onClick={() => setDetailsTaskId(task.id)}
                      className={`w-full text-left bg-white p-4 rounded-lg shadow-sm border hover:shadow-md transition-shadow group relative ${
                        draggingId === task.id ? "opacity-70 border-blue-300" : "border-slate-200"
                      }`}
                      title="Click for details"
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                        <select
                          value={task.status}
                          onChange={(e) => void handleStatusChange(task.id, e.target.value as TaskStatus)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs bg-transparent text-slate-400 border-none outline-none cursor-pointer hover:text-blue-600"
                          aria-label="Change task status"
                        >
                          <option value={TaskStatus.TODO}>To Do</option>
                          <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                          <option value={TaskStatus.DONE}>Done</option>
                        </select>
                      </div>
                      <h4 className="font-medium text-slate-800 mb-3">{task.title}</h4>

                      <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-50 pt-3 gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <User size={14} />
                          <span className="truncate">{task.assignee}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <AlertCircle size={14} className={isOverdue(task) ? "text-red-500" : ""} />
                          <span>{task.deadline ? `Due ${task.deadline}` : "No due date"}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                      {col.id === "OVERDUE" ? "No overdue tasks" : "Drop tasks here"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-2">Future: Slack Workflow (coming soon)</h3>
        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li>Owners can assign tasks to a Slack user or channel when creating a task.</li>
          <li>Task creation posts a Slack message; a single thumbs-up reaction marks it assigned/acknowledged.</li>
          <li>A single salute reaction (or configured reaction) marks the task complete.</li>
          <li>No login required for staff: owners manage tasks here; staff interacts via Slack.</li>
          <li>Dashboard metric: Slack acknowledgements and completions will feed response/finish-time efficiency reporting.</li>
        </ul>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCompletedOpen((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <div>
              <h3 className="font-semibold text-slate-800">Completed</h3>
              <p className="text-xs text-slate-500">
                {completedTasks.length} total
                {completionStats.avgResponseMs !== null && (
                  <>
                    {" "}
                    • Avg response {formatDuration(completionStats.avgResponseMs)} ({completionStats.responseCount})
                  </>
                )}
                {completionStats.avgCompletionMs !== null && (
                  <>
                    {" "}
                    • Avg completion {formatDuration(completionStats.avgCompletionMs)} ({completionStats.completionCount})
                  </>
                )}
              </p>
            </div>
          </div>
          <span className="text-sm text-slate-500">{completedOpen ? "Hide" : "Show"}</span>
        </button>

        {completedOpen && (
          <div className="px-5 pb-5">
            {completedTasks.length === 0 ? (
              <div className="text-sm text-slate-500 py-6">No completed tasks yet.</div>
            ) : (
              <div className="space-y-3">
                {completedTasks.slice(0, 25).map((task) => {
                  const created = parseIsoMs(task.createdAt);
                  const responded = parseIsoMs(task.respondedAt);
                  const completed = parseIsoMs(task.completedAt);
                  const responseMs = created !== null && responded !== null && responded >= created ? responded - created : null;
                  const completionMs = created !== null && completed !== null && completed >= created ? completed - created : null;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setDetailsTaskId(task.id)}
                      className="w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg p-4"
                      title="Click for details"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getPriorityColor(task.priority)}`}>
                              {task.priority}
                            </span>
                            <span className="text-xs text-slate-500 truncate">{task.assignee}</span>
                          </div>
                          <div className="font-medium text-slate-900 mt-1 truncate">{task.title}</div>
                        </div>
                        <div className="text-xs text-slate-500 text-right whitespace-nowrap">
                          {task.completedAt ? String(task.completedAt).slice(0, 10) : "—"}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Response: {responseMs === null ? "—" : formatDuration(responseMs)}</span>
                        <span>Completion: {completionMs === null ? "—" : formatDuration(completionMs)}</span>
                        <span>{task.deadline ? `Due: ${task.deadline}` : "No due date"}</span>
                      </div>
                    </button>
                  );
                })}
                {completedTasks.length > 25 && (
                  <div className="text-xs text-slate-500 pt-1">Showing latest 25 completed tasks.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Task</p>
                <h4 className="text-lg font-semibold text-slate-900 truncate">{selectedTask.title}</h4>
              </div>
              <button
                onClick={() => setDetailsTaskId(null)}
                className="text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Assignee</p>
                  <p className="text-sm text-slate-800">{selectedTask.assignee}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <p className="text-sm text-slate-800">
                    {selectedTask.status === TaskStatus.TODO && "To Do"}
                    {selectedTask.status === TaskStatus.IN_PROGRESS && "In Progress"}
                    {selectedTask.status === TaskStatus.DONE && "Completed"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due date</label>
                <input
                  type="date"
                  value={detailsDueDate}
                  onChange={(e) => setDetailsDueDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Tasks past their due date automatically appear in Overdue.</p>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => void handleStatusChange(selectedTask.id, TaskStatus.DONE)}
                className="text-sm px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50"
              >
                Mark Done
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailsTaskId(null)}
                  className="text-sm text-slate-600 px-4 py-2 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveDueDate()}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskManager;
