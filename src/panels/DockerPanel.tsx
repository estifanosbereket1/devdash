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
};

export function DockerPanel({ containers, images, volumes, actBusy, actContainer, imageBusy, removeImage, volumeBusy, removeVolume }: Props) {
  return (
    <Flyout>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 6 }}>Containers</div>
      {containers.map((c) => (
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
      ))}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>Images</div>
      {images.map((img) => (
        <FlyoutRow
          key={img.id}
          title={img.tags.length > 0 ? img.tags.join(", ") : `<untagged> ${img.id}`}
          subtitle={`${img.size_mb.toFixed(0)} MB`}
          actions={<FlyoutButton disabled={imageBusy === img.id} onClick={() => removeImage(img.id, img.tags[0] ?? img.id)}>remove</FlyoutButton>}
        />
      ))}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>Volumes</div>
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
