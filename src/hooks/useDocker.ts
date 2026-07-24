import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirmUnless } from "../utils";
import type { ContainerInfo, ImageInfo, VolumeInfo } from "../types";

export function useDockerContainers() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    invoke<ContainerInfo[]>("list_containers")
      .then((c) => { setContainers(c); setError(null); })
      .catch((e) => setError(e as string));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  return { containers, error, refresh };
}

export function useContainerActions(refresh: () => void, skipConfirmations: boolean) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, name: string, action: "start_container" | "stop_container" | "remove_container") => {
    if (action === "remove_container") {
      const confirmed = await confirmUnless(skipConfirmations,
        `Permanently remove "${name}"? This cannot be undone.`,
        { title: "Remove container", kind: "warning" }
      );
      if (!confirmed) return;
    }
    setBusy(id);
    try {
      await invoke(action, { containerId: id });
      refresh();
    } catch (e) {
      setError(e as string);
    } finally {
      setBusy(null);
    }
  };

  return { act, busy, error };
}

export function useDockerImages() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const refresh = () => invoke<ImageInfo[]>("list_images").then(setImages);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);
  return { images, refresh };
}

export function useImageActions(refresh: () => void, skipConfirmations: boolean) {
  const [busy, setBusy] = useState<string | null>(null);

  const removeImage = async (id: string, label: string) => {
    const confirmed = await confirmUnless(skipConfirmations, `Remove image "${label}"?`, { title: "Remove image", kind: "warning" });
    if (!confirmed) return;
    setBusy(id);
    try {
      await invoke("remove_image", { imageId: id });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return { removeImage, busy };
}

export function useDockerVolumes() {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const refresh = () => invoke<VolumeInfo[]>("list_volumes").then(setVolumes);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);
  return { volumes, refresh };
}

export function useVolumeActions(refresh: () => void, skipConfirmations: boolean) {
  const [busy, setBusy] = useState<string | null>(null);

  const removeVolume = async (name: string) => {
    const confirmed = await confirmUnless(skipConfirmations,
      `Remove volume "${name}"? Any data inside it is gone permanently.`,
      { title: "Remove volume", kind: "warning" }
    );
    if (!confirmed) return;
    setBusy(name);
    try {
      await invoke("remove_volume", { volumeName: name });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return { removeVolume, busy };
}
