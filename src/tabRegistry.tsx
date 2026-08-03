import { Server, Container, FolderGit2, Plug, StickyNote, ShieldAlert, Trash2, Clock, Music, CheckSquare, Radio, Database, BookOpen, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TabId =
  | "systemd" | "docker" | "projects" | "ports" | "notes" | "secrets"
  | "bloat" | "cron" | "music" | "tasks" | "rest" | "database" | "journal" | "tunnels";

export const DEFAULT_TAB_IDS: TabId[] = [
  "systemd", "docker", "projects", "ports", "notes", "secrets",
  "bloat", "cron", "music", "tasks", "rest", "database", "journal", "tunnels",
];

export const TAB_REGISTRY: Record<TabId, { label: string; icon: LucideIcon }> = {
  systemd: { label: "Services", icon: Server },
  docker: { label: "Docker", icon: Container },
  projects: { label: "Projects", icon: FolderGit2 },
  ports: { label: "Ports", icon: Plug },
  notes: { label: "Notes", icon: StickyNote },
  secrets: { label: "Secrets", icon: ShieldAlert },
  bloat: { label: "Bloat", icon: Trash2 },
  cron: { label: "Cron", icon: Clock },
  music: { label: "Music", icon: Music },
  tasks: { label: "Tasks", icon: CheckSquare },
  rest: { label: "REST Client", icon: Radio },
  database: { label: "Database", icon: Database },
  journal:{label:"Journal", icon:BookOpen},
  tunnels: { label: "Tunnels", icon: Globe },
};

export const MIN_ENABLED_TABS = 4;
