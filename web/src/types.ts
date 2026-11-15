export type Kind = { label: string; dir: string; loaders: string[]; project_type: string };
export type Server = {
    id: string; name: string; description: string; port: number; ram_min: number; ram_max: number; java: number;
    jar: string; startup: string; flags_preset: string; custom_flags: string;
    software: { type: string; version: string; build?: string; build_id?: number };
    auto_restart: boolean; autostart: boolean; eula: boolean; playit: boolean; created?: number;
    backup: { interval: number; keep: number; ignore: string };
    state: 'running' | 'starting' | 'stopping' | 'offline'; address: string; dir: string; label: string;
    kinds: Record<string, Kind>; nav_label: string | null; preview: string;
};
export type SoftwareType = { id: string; name: string; group: string; description: string; deprecated: boolean };
export type Meta = {
    types: SoftwareType[]; groups: Record<string, string>; intervals: Record<string, string>; sorts: Record<string, string>;
    default_startup: string; system: { data_dir: string; php: string; cpus: number };
};
export type Session = { setup: boolean; user: string | null; csrf: string; name: string; warning: string | null };
