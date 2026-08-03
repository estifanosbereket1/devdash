use bollard::query_parameters::{
    ListContainersOptionsBuilder, ListImagesOptionsBuilder, ListVolumesOptionsBuilder,
    RemoveContainerOptionsBuilder, RemoveImageOptionsBuilder, RemoveVolumeOptionsBuilder,
    StopContainerOptionsBuilder,
};
use bollard::Docker;

#[derive(serde::Serialize)]
pub struct ContainerInfo {
    id: String,
    name: String,
    image: String,
    status: String,
    state: String,
    compose_project: Option<String>,
}

#[tauri::command]
pub async fn list_containers() -> Result<Vec<ContainerInfo>, String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;

    let options = ListContainersOptionsBuilder::default()
        .all(true) // include stopped containers, not just running ones
        .build();

    let containers = docker
        .list_containers(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(containers
        .into_iter()
        .map(|c| ContainerInfo {
            id: c.id.unwrap_or_default().chars().take(12).collect(),
            name: c
                .names
                .unwrap_or_default()
                .first()
                .cloned()
                .unwrap_or_default()
                .trim_start_matches('/')
                .to_string(),
            image: c.image.unwrap_or_default(),
            status: c.status.unwrap_or_default(),
            state: c.state.map(|s| s.to_string()).unwrap_or_default(),
            compose_project: c
                .labels
                .as_ref()
                .and_then(|l| l.get("com.docker.compose.project").cloned()),
        })
        .collect())
}

#[derive(serde::Serialize)]
pub struct ImageInfo {
    id: String,
    tags: Vec<String>,
    size_mb: f64,
}

#[tauri::command]
pub async fn list_images() -> Result<Vec<ImageInfo>, String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;

    let options = ListImagesOptionsBuilder::default().all(false).build();

    let images = docker
        .list_images(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(images
        .into_iter()
        .map(|i| ImageInfo {
            id: i.id.chars().skip(7).take(12).collect(), // strips "sha256:" prefix
            tags: i.repo_tags,
            size_mb: i.size as f64 / 1e6,
        })
        .collect())
}

#[tauri::command]
pub async fn start_container(container_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    docker
        .start_container(&container_id, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_container(container_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = StopContainerOptionsBuilder::default().t(10).build(); // 10s grace period before force-kill
    docker
        .stop_container(&container_id, Some(options))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_container(container_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = RemoveContainerOptionsBuilder::default().force(true).build();
    docker
        .remove_container(&container_id, Some(options))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_image(image_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = RemoveImageOptionsBuilder::default().force(true).build();
    docker
        .remove_image(&image_id, Some(options), None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct VolumeInfo {
    name: String,
    driver: String,
    mount_point: String,
}

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;

    let options = ListVolumesOptionsBuilder::default().build();
    let response = docker
        .list_volumes(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(response
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| VolumeInfo {
            name: v.name,
            driver: v.driver,
            mount_point: v.mountpoint,
        })
        .collect())
}

#[tauri::command]
pub async fn remove_volume(volume_name: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = RemoveVolumeOptionsBuilder::default().force(true).build();
    docker
        .remove_volume(&volume_name, Some(options))
        .await
        .map_err(|e| e.to_string())
}
