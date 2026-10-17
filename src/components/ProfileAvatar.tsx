import { useState } from "react";
import { Initials } from "@/components/common";
import { useAvatar } from "@/lib/supabase/avatar";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The signed-in user's photo, or their initials when there is none (or it can't load). */
export function ProfileAvatar({ name, className }: { name: string; className?: string }) {
  const avatar = useAvatar();
  const { t } = useI18n();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = avatar.data?.status === "photo" ? avatar.data.url : null;

  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt={t("avatar.alt")}
        onError={() => setFailedUrl(url)}
        className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
      />
    );
  }
  return <Initials name={name} className={className} />;
}
