import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import type { ContainerInfo, ImageInfo, VolumeInfo } from "../types";

type Props = {
  containers: ContainerInfo[];
  images: ImageInfo[];
  volumes: VolumeInfo[];
  actBusy: string | null;
  actContainer: (id: string, name: string, action: "start_container" | "stop_container" | "remove_container") => void;
  imageBusy: string | null;
  removeImage: (id: string, label: string) => void;
  volumeBusy: string | null;
  removeVolume: (name: string) => void;
  error: string | null;
};

function EmptyState({ children }: { children: string }) {
  return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", padding: "4px 0 10px" }}>{children}</div>;
}

function containerRow(c: ContainerInfo, actBusy: string | null, actContainer: Props["actContainer"]) {
  return (
    <FlyoutRow
      key={c.id}
      title={c.name}
      subtitle={c.image}
      status={c.status}
      statusColor={c.state === "running" ? "#5eead4" : undefined}
      actions={<>
        <FlyoutButton disabled={actBusy === c.id} onClick={() => actContainer(c.id, c.name, "start_container")}>start</FlyoutButton>
        <FlyoutButton disabled={actBusy === c.id} onClick={() => actContainer(c.id, c.name, "stop_container")}>stop</FlyoutButton>
        <FlyoutButton disabled={actBusy === c.id} onClick={() => actContainer(c.id, c.name, "remove_container")}>remove</FlyoutButton>
      </>}
    />
  );
}

export function DockerPanel({ containers, images, volumes, actBusy, actContainer, imageBusy, removeImage, volumeBusy, removeVolume, error }: Props) {
  const standalone = containers.filter((c) => !c.compose_project);
  const byStack = containers.reduce<Record<string, ContainerInfo[]>>((acc, c) => {
    if (c.compose_project) (acc[c.compose_project] ??= []).push(c);
    return acc;
  }, {});
  const hasStacks = Object.keys(byStack).length > 0;

  return (
    <Flyout>
      {error && (
        <p style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>
          Can't reach Docker — {error}. Is the daemon running and is this user in the `docker` group?
        </p>
      )}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 6 }}>Containers</div>
      {standalone.length === 0 && !hasStacks && !error && (
        <EmptyState>No containers yet — start one with `docker run` or bring up a compose stack from the Projects panel.</EmptyState>
      )}
      {standalone.map((c) => containerRow(c, actBusy, actContainer))}

      {Object.entries(byStack).map(([stack, group]) => (
        <div key={stack}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>Stack: {stack}</div>
          {group.map((c) => containerRow(c, actBusy, actContainer))}
        </div>
      ))}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>Images</div>
      {images.length === 0 && !error && <EmptyState>No images pulled yet.</EmptyState>}
      {images.map((img) => (
        <FlyoutRow
          key={img.id}
          title={img.tags.length > 0 ? img.tags.join(", ") : `<untagged> ${img.id}`}
          subtitle={`${img.size_mb.toFixed(0)} MB`}
          actions={<FlyoutButton disabled={imageBusy === img.id} onClick={() => removeImage(img.id, img.tags[0] ?? img.id)}>remove</FlyoutButton>}
        />
      ))}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>Volumes</div>
      {volumes.length === 0 && !error && <EmptyState>No volumes yet.</EmptyState>}
      {volumes.map((v) => (
        <FlyoutRow
          key={v.name}
          title={v.name}
          subtitle={`${v.driver} · ${v.mount_point}`}
          actions={<FlyoutButton disabled={volumeBusy === v.name} onClick={() => removeVolume(v.name)}>remove</FlyoutButton>}
        />
      ))}
    </Flyout>
  );
}
