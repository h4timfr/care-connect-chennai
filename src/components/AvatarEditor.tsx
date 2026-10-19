import { Camera, Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/AuthCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import {
  AVATAR_ACCEPTED_TYPES,
  AVATAR_MAX_INPUT_BYTES,
  AVATAR_MIN_DIMENSION,
  AvatarFileError,
  checkAvatarFile,
  isAvatarStorageUnavailable,
  useAvatar,
  useRemoveAvatar,
  useUploadAvatar,
} from "@/lib/supabase/avatar";
import { describeDataError } from "@/lib/supabase/errors";

const MAX_MB = AVATAR_MAX_INPUT_BYTES / (1024 * 1024);

/** Profile photo with upload / replace / remove. Falls back to initials everywhere. */
export function AvatarEditor({ name }: { name: string }) {
  const { t } = useI18n();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const avatar = useAvatar();
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Release the local preview once it's no longer shown.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const busy = upload.isPending || remove.isPending;
  const state = avatar.data?.status;
  const hasPhoto = state === "photo";

  const problemMessage = (err: unknown) => {
    if (err instanceof AvatarFileError) {
      switch (err.problem) {
        case "invalidType":
          return t("avatar.invalidType");
        case "tooLarge":
          return t("avatar.tooLarge", { size: MAX_MB });
        case "tooSmall":
          return t("avatar.tooSmall", { size: AVATAR_MIN_DIMENSION });
        case "unreadable":
          return t("avatar.unreadable");
      }
    }
    if (isAvatarStorageUnavailable(err)) return t("avatar.notAvailable");
    return t("avatar.uploadFailed", { reason: t(describeDataError(err)) });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow choosing the same file again after an error.
    e.target.value = "";
    if (!file || busy) return;
    setError(null);
    const problem = checkAvatarFile(file);
    if (problem) {
      setError(problemMessage(new AvatarFileError(problem)));
      return;
    }
    setPreview(URL.createObjectURL(file));
    try {
      await upload.mutateAsync(file);
      toast.success(t("avatar.uploaded"));
    } catch (err) {
      setError(problemMessage(err));
    } finally {
      setPreview(null);
    }
  };

  const onRemove = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      setConfirmOpen(false);
      toast.success(t("avatar.removed"));
    } catch (err) {
      setConfirmOpen(false);
      setError(t("avatar.removeFailed", { reason: t(describeDataError(err)) }));
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <div className="relative">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="h-24 w-24 rounded-full object-cover opacity-70"
            aria-hidden
          />
        ) : (
          <ProfileAvatar name={name} className="h-24 w-24 text-2xl" />
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-background/40">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          </span>
        ) : null}
      </div>

      {state === "unavailable" ? (
        <p className="max-w-xs text-center text-xs text-muted-foreground sm:text-start">
          {t("avatar.notAvailable")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={AVATAR_ACCEPTED_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              // Opened by the button below, which is the one control assistive tech should see.
              aria-hidden
              aria-label={hasPhoto ? t("avatar.replace") : t("avatar.upload")}
              onChange={onFile}
              disabled={busy || avatar.isPending}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || avatar.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="h-4 w-4" aria-hidden />
              )}
              {upload.isPending
                ? t("avatar.uploading")
                : hasPhoto
                  ? t("avatar.replace")
                  : t("avatar.upload")}
            </Button>
            {hasPhoto ? (
              <AlertDialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {t("avatar.remove")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("avatar.confirmRemoveTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("avatar.confirmRemoveBody")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>{t("avatar.keep")}</AlertDialogCancel>
                    <Button variant="destructive" onClick={onRemove} disabled={busy}>
                      {remove.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : null}
                      {remove.isPending ? t("avatar.removing") : t("avatar.remove")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
          <p className="max-w-xs text-center text-xs text-muted-foreground sm:text-start">
            {t("avatar.hint", { size: MAX_MB })}
          </p>
        </>
      )}
      {avatar.isError ? (
        <p className="text-xs text-muted-foreground">{t("avatar.loadFailed")}</p>
      ) : null}
      {error ? (
        <div className="w-full max-w-sm">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}
    </div>
  );
}
