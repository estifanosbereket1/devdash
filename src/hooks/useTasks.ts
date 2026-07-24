import { useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import type { Task } from "../types";

export function useTasks() {
  const [store, setStore] = useState<Store | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    Store.load("tasks.json").then(async (s) => {
      setStore(s);
      setTasks((await s.get<Task[]>("tasks")) ?? []);
    });
  }, []);

  const persist = async (updated: Task[]) => {
    setTasks(updated);
    if (store) {
      await store.set("tasks", updated);
      await store.save();
    }
  };

  const addTask = (title: string, date: string, time: string | null) => {
    const task: Task = { id: crypto.randomUUID(), title, date, time, completed: false };
    persist([...tasks, task]);
  };

  const toggleTask = (id: string) => {
    persist(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = (id: string) => {
    persist(tasks.filter((t) => t.id !== id));
  };

  return { tasks, addTask, toggleTask, deleteTask };
}
