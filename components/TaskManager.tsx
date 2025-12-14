import React, { useState } from 'react';
import { Task, TaskStatus } from '../types';
import { INITIAL_TASKS } from '../constants';
import { Clock, Plus, User, AlertCircle, CheckCircle2, Circle } from 'lucide-react';

const TaskManager: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      assignee: 'Unassigned',
      deadline: new Date().toISOString().split('T')[0],
      status: TaskStatus.TODO,
      priority: 'medium'
    };
    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setIsAdding(false);
  };

  const getPriorityColor = (p: string) => {
    switch(p) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-amber-100 text-amber-700';
      case 'low': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const Columns = [
    { id: TaskStatus.TODO, label: 'To Do', icon: <Circle size={18} className="text-slate-500" /> },
    { id: TaskStatus.IN_PROGRESS, label: 'In Progress', icon: <Clock size={18} className="text-blue-500" /> },
    { id: TaskStatus.DONE, label: 'Completed', icon: <CheckCircle2 size={18} className="text-green-500" /> },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Task Board</h2>
           <p className="text-slate-500">Manage floor updates, orders, and staff assignments.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
        >
          <Plus size={18} className="mr-2" />
          Add Task
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 flex gap-3 animate-fade-in">
          <input 
            type="text" 
            placeholder="What needs to be done?"
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <button onClick={addTask} className="bg-slate-900 text-white px-4 py-2 rounded-md">Save</button>
          <button onClick={() => setIsAdding(false)} className="text-slate-500 px-4 py-2">Cancel</button>
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-6 min-w-[1000px] h-full pb-4">
          {Columns.map(col => (
            <div key={col.id} className="flex-1 bg-slate-100 rounded-xl p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                  {col.icon}
                  {col.label}
                </div>
                <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">
                  {tasks.filter(t => t.status === col.id).length}
                </span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {tasks.filter(t => t.status === col.id).map(task => (
                  <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow group relative">
                    <div className="flex justify-between items-start mb-2">
                       <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getPriorityColor(task.priority)}`}>
                         {task.priority}
                       </span>
                       {/* Quick Move Dropdown (visible on hover or always for simplicity in this demo) */}
                       <select 
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                          className="text-xs bg-transparent text-slate-400 border-none outline-none cursor-pointer hover:text-blue-600"
                       >
                          <option value={TaskStatus.TODO}>To Do</option>
                          <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                          <option value={TaskStatus.DONE}>Done</option>
                       </select>
                    </div>
                    <h4 className="font-medium text-slate-800 mb-3">{task.title}</h4>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-50 pt-3">
                       <div className="flex items-center gap-1">
                          <User size={14} />
                          {task.assignee}
                       </div>
                       <div className="flex items-center gap-1">
                          <AlertCircle size={14} className={new Date(task.deadline) < new Date() ? 'text-red-500' : ''} />
                          {task.deadline}
                       </div>
                    </div>
                  </div>
                ))}
                {tasks.filter(t => t.status === col.id).length === 0 && (
                   <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                      No tasks in this stage
                   </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskManager;
