export type ProjectInfo = { name: string; path: string; kind: string };
export type MemoryInfo = { used_gb: number; total_gb: number; ratio: number };
export type BatteryInfo = {
  percentage: number;
  capacity_health: number;
  cycle_count: number | null;
  status: string;
};
export type DiskInfo = { name: string; mount_point: string; total_gb: number; free_gb: number; used_ratio: number };
export type TempReading = { label: string; celsius: number };
export type UnitInfo = {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
};
export type ContainerInfo = { id: string; name: string; image: string; status: string; state: string };
export type ImageInfo = { id: string; tags: string[]; size_mb: number };
export type VolumeInfo = { name: string; driver: string; mount_point: string };
export type GitStatus = { branch: string; dirty: boolean; ahead: number; behind: number; has_remote: boolean };
export type EnvRisk = {
  project_path: string;
  project_name: string;
  env_file: string;
  gitignored: boolean;
  suspicious_keys: string[];
};
export type BloatEntry = { project_name: string; folder_name: string; path: string; size_mb: number };
export type CronJob = { schedule: string; command: string; human_readable: string; raw_line: string };
export type PortInfo = { port: number; protocol: string; pid: number | null; process: string | null };
export type TrackInfo = { path: string; title: string; artist: string; album: string; duration_secs: number };
export type RepeatMode = "off" | "all" | "one";

export type Task = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, optional
  completed: boolean;
};
