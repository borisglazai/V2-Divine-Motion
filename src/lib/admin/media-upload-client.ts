/**
 * Client-side multi-upload module (Implementation Brief 014 §61-65) — the
 * ONLY piece of this brief that runs in the browser rather than the Worker.
 * No framework, no bundler beyond what Astro's `<script>` processing
 * already does. Each selected file runs its own independent
 * authorize -> PUT -> upload-complete cycle (§23): one file failing never
 * blocks the others, and each row in the DOM list reflects only that
 * file's own state (§24 — "pas une barre globale opaque").
 *
 * Direct upload discipline (§39): the PUT goes straight from this module to
 * the presigned R2 URL — never through a same-origin endpoint, never
 * touching `/admin/media/*` for the byte transfer itself.
 */

type UploadStatus = "authorizing" | "uploading" | "verifying" | "ready" | "failed";

interface UploadItem {
  file: File;
  status: UploadStatus;
  progressPercent: number | null;
  errorMessage: string | null;
  row: HTMLLIElement;
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  authorizing: "En attente…",
  uploading: "Upload…",
  verifying: "Vérification…",
  ready: "Prêt",
  failed: "Échec",
};

function renderItem(item: UploadItem): void {
  const status = item.row.querySelector<HTMLElement>("[data-status]");
  if (status) {
    const percent = item.status === "uploading" && item.progressPercent !== null ? ` ${item.progressPercent}%` : "";
    status.textContent = STATUS_LABEL[item.status] + percent;
  }
  item.row.dataset.uploadStatus = item.status;

  const error = item.row.querySelector<HTMLElement>("[data-error]");
  if (error) error.textContent = item.errorMessage ?? "";

  const retry = item.row.querySelector<HTMLButtonElement>("[data-retry]");
  if (retry) retry.hidden = item.status !== "failed";
}

function putWithProgress(uploadUrl: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

async function runUpload(item: UploadItem): Promise<void> {
  item.status = "authorizing";
  item.progressPercent = null;
  item.errorMessage = null;
  renderItem(item);

  let mediaId: number;
  let uploadUrl: string;
  try {
    const authorizeRes = await fetch("/admin/media/upload/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: item.file.name, mimeType: item.file.type, sizeBytes: item.file.size }),
    });
    const authorizeJson = (await authorizeRes.json()) as
      | { ok: true; mediaId: number; uploadUrl: string }
      | { ok: false; message: string };
    if (!authorizeJson.ok) throw new Error(authorizeJson.message);
    mediaId = authorizeJson.mediaId;
    uploadUrl = authorizeJson.uploadUrl;
  } catch (err) {
    item.status = "failed";
    item.errorMessage = err instanceof Error ? err.message : "Échec de l'autorisation.";
    renderItem(item);
    return;
  }

  item.status = "uploading";
  renderItem(item);
  try {
    await putWithProgress(uploadUrl, item.file, (percent) => {
      item.progressPercent = percent;
      renderItem(item);
    });
  } catch (err) {
    item.status = "failed";
    item.errorMessage = err instanceof Error ? err.message : "Échec de l'envoi.";
    renderItem(item);
    return;
  }

  item.status = "verifying";
  renderItem(item);
  try {
    const completeRes = await fetch(`/admin/media/${mediaId}/upload-complete`, { method: "POST" });
    const completeJson = (await completeRes.json()) as { ok: true } | { ok: false; message: string };
    if (!completeJson.ok) throw new Error(completeJson.message);
  } catch (err) {
    item.status = "failed";
    item.errorMessage = err instanceof Error ? err.message : "Échec de la vérification.";
    renderItem(item);
    return;
  }

  item.status = "ready";
  renderItem(item);
}

function settled(item: UploadItem): boolean {
  return item.status === "ready" || item.status === "failed";
}

export function initMediaUploader(): void {
  const input = document.getElementById("media-upload-input") as HTMLInputElement | null;
  const list = document.getElementById("media-upload-list") as HTMLUListElement | null;
  const refreshButton = document.getElementById("media-upload-refresh") as HTMLButtonElement | null;
  const template = document.getElementById("media-upload-row-template") as HTMLTemplateElement | null;
  if (!input || !list || !template) return;

  const items: UploadItem[] = [];

  function checkAllSettled(): void {
    if (items.length > 0 && items.every(settled) && refreshButton) {
      refreshButton.hidden = false;
    }
  }

  function startItem(item: UploadItem): void {
    void runUpload(item).then(checkAllSettled);
  }

  input.addEventListener("change", () => {
    const files = input.files;
    if (!files || files.length === 0) return;
    if (refreshButton) refreshButton.hidden = true;

    for (const file of Array.from(files)) {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const row = fragment.querySelector("li") as HTMLLIElement;
      const name = row.querySelector<HTMLElement>("[data-filename]");
      if (name) name.textContent = file.name;
      list.appendChild(row);

      const item: UploadItem = { file, status: "authorizing", progressPercent: null, errorMessage: null, row };
      items.push(item);
      renderItem(item);

      const retryButton = row.querySelector<HTMLButtonElement>("[data-retry]");
      retryButton?.addEventListener("click", () => startItem(item));

      startItem(item);
    }

    input.value = "";
  });

  refreshButton?.addEventListener("click", () => window.location.reload());
}
