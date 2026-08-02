import { useAction, useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { ArticleMedia, ArticleMediaKind } from "./article-types";

type UploadResult = {
  fileId?: string;
  url?: string;
  fileType?: string;
  width?: number;
  height?: number;
  message?: string;
};

export default function AdminMediaUpload({
  folder,
  accept = "image/*,video/*,audio/*",
  label = "Choose media",
  onUploaded,
}: {
  folder: string;
  accept?: string;
  label?: string;
  onUploaded: (asset: ArticleMedia) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const createUploadToken = useAction(api.media.createUploadToken);
  const registerAsset = useMutation(api.media.registerAsset);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setState("uploading");
    setMessage(`Uploading ${file.name}…`);
    try {
      const auth = await createUploadToken({ fileName: file.name, folder });
      const form = new FormData();
      form.append("file", file);
      Object.entries(auth.fields).forEach(([key, value]) => {
        form.append(key, value);
      });
      form.append("token", auth.token);
      const response = await fetch(auth.uploadUrl, {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as UploadResult;
      if (!response.ok || !result.fileId || !result.url) {
        throw new Error(result.message ?? "Upload failed.");
      }
      const kind: ArticleMediaKind = result.fileType?.startsWith("video")
        ? "video"
        : result.fileType?.startsWith("audio")
          ? "audio"
          : "image";
      await registerAsset({
        fileId: result.fileId,
        url: result.url,
        kind,
        alt: file.name,
        width: result.width,
        height: result.height,
      });
      onUploaded({ src: result.url, alt: file.name, kind });
      setState("done");
      setMessage("Uploaded");
    } catch (reason) {
      setState("error");
      setMessage(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="studio-media-upload" data-state={state}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={state === "uploading"}
      >
        <span aria-hidden="true">{state === "uploading" ? "◌" : "+"}</span>
        {state === "uploading" ? "Uploading…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        onChange={(event) => void upload(event.currentTarget.files?.[0])}
      />
      {message ? (
        <small role={state === "error" ? "alert" : "status"}>{message}</small>
      ) : null}
    </div>
  );
}
