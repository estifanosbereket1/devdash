import { Flyout, FlyoutRow, FlyoutButton, EditorPicker, RootChip } from "../Flyout";
import type { ProjectInfo, GitStatus, EditorInfo } from "../types";

const KINDS = ["Flutter", "TypeScript", "JavaScript", "Python", "PHP", "Java", "Go", "Rust", "C#"];

type Props = {
  roots: string[];
  addRoot: () => void;
  removeRoot: (path: string) => void;
  projects: ProjectInfo[];
  statuses: Record<string, GitStatus>;
  prefs: Record<string, string>;
  setEditorFor: (path: string, editor: string) => void;
  openProject: (path: string) => void;
  editors: EditorInfo[];
  composeUp: (path: string) => void;
  composeDown: (path: string) => void;
  composeBusy: string | null;
};

// Editors with no `kinds` suit any project; otherwise only show the editor
// for project kinds it was built for (e.g. Android Studio for Flutter/Java).
function editorsForKind(editors: EditorInfo[], kind: string): EditorInfo[] {
  return editors.filter((e) => e.kinds.length === 0 || e.kinds.includes(kind));
}

export function ProjectsPanel({ roots, addRoot, removeRoot, projects, statuses, prefs, setEditorFor, openProject, editors, composeUp, composeDown, composeBusy }: Props) {
  return (
    <Flyout>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <FlyoutButton onClick={addRoot}>add folder</FlyoutButton>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {roots.map((r) => <RootChip key={r} path={r} onRemove={() => removeRoot(r)} />)}
      </div>

      {KINDS.map((kind) => {
        const group = projects.filter((p) => p.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "10px 0 4px" }}>{kind}</div>
            {group.map((p) => {
              const git = statuses[p.path];
              return (
                <FlyoutRow
                  key={p.path}
                  title={
                    <span onClick={() => openProject(p.path)} style={{ cursor: "pointer" }}>
                      {p.name}
                      {p.has_compose && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(94,234,212,0.15)", color: "#5eead4" }}>
                          stack
                        </span>
                      )}
                    </span>
                  }
                  subtitle={
                    git ? (
                      <span>
                        <span style={{ color: git.dirty ? "var(--accent)" : "#5eead4" }}>{git.branch}</span>
                        {git.dirty && " · uncommitted changes"}
                        {git.ahead > 0 && ` · ↑${git.ahead}`}
                        {git.behind > 0 && ` · ↓${git.behind}`}
                      </span>
                    ) : p.path
                  }
                  actions={
                    <>
                      {p.has_compose && (
                        <>
                          <FlyoutButton disabled={composeBusy === p.path} onClick={() => composeUp(p.path)}>up</FlyoutButton>
                          <FlyoutButton disabled={composeBusy === p.path} onClick={() => composeDown(p.path)}>down</FlyoutButton>
                        </>
                      )}
                      <EditorPicker value={prefs[p.path] ?? "vscode"} onChange={(editor) => setEditorFor(p.path, editor)} editors={editorsForKind(editors, kind)} />
                    </>
                  }
                />
              );
            })}
          </div>
        );
      })}
    </Flyout>
  );
}
