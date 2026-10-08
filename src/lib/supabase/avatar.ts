import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import { messageOf } from "./errors";
import { useAuth } from "./auth";

/**
 * Profile photos live in the private `avatars` bucket (migration 00053), one object per account at
 * `<auth user id>/avatar`. Storage policies only let a signed-in user read, write or delete that
 * one path of their own, so photos are never public and can't be overwritten by anyone else.
 */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIN_DIMENSION = 64;
/** Stored photos are square, at most this many pixels on a side. */
export const AVATAR_SIZE = 512;
export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const SIGNED_URL_SECONDS = 60 * 60;
const URL_STALE_MS = 50 * 60 * 1000;

export const avatarPath = (userId: string) => `${userId}/avatar`;

export type AvatarState =
  | { status: "none" }
  | { status: "photo"; url: string }
  /** The bucket isn't set up on this backend yet; uploads can't work. */
  | { status: "unavailable" };

function isMissingObject(error: unknown) {
  return /object not found|not_found|404/i.test(messageOf(error));
}

function isMissingBucket(error: unknown) {
  return /bucket not found/i.test(messageOf(error));
}

/**
 * True when uploads can't work on this backend at all: the bucket is missing, or exists without the
 * owner policies from migration 00053 (Storage then rejects every write with an RLS error).
 */
export function isAvatarStorageUnavailable(error: unknown) {
  return isMissingBucket(error) || /row-level security|row level security/i.test(messageOf(error));
}

export function useAvatar() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ["avatar", userId],
    enabled: !!userId,
    staleTime: URL_STALE_MS,
    retry: false,
    queryFn: async (): Promise<AvatarState> => {
      if (!userId) return { status: "none" };
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(avatarPath(userId), SIGNED_URL_SECONDS);
      if (error) {
        if (isMissingBucket(error)) return { status: "unavailable" };
        if (isMissingObject(error)) return { status: "none" };
        throw error;
      }
      return { status: "photo", url: data.signedUrl };
    },
  });
}

export type AvatarProblem = "invalidType" | "tooLarge" | "tooSmall" | "unreadable";

export class AvatarFileError extends Error {
  constructor(readonly problem: AvatarProblem) {
    super(problem);
    this.name = "AvatarFileError";
  }
}

/** Checks type and size before decoding, so oversized or non-image files are never processed. */
export function checkAvatarFile(file: File): AvatarProblem | null {
  if (!(AVATAR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "invalidType";
  if (file.size > AVATAR_MAX_INPUT_BYTES) return "tooLarge";
  return null;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decodes the image, centre-crops it to a square and re-encodes it at AVATAR_SIZE. Re-encoding
 * also drops any metadata (e.g. GPS location in camera photos) before the file leaves the device.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  const problem = checkAvatarFile(file);
  if (problem) throw new AvatarFileError(problem);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarFileError("unreadable");
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (side < AVATAR_MIN_DIMENSION) throw new AvatarFileError("tooSmall");
    const size = Math.min(AVATAR_SIZE, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AvatarFileError("unreadable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    // Browsers that can't encode WebP silently return PNG; use JPEG there instead.
    const webp = await canvasToBlob(canvas, "image/webp", 0.85);
    if (webp?.type === "image/webp") return webp;
    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.88);
    if (!jpeg) throw new AvatarFileError("unreadable");
    return jpeg;
  } finally {
    bitmap.close();
  }
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not signed in");
      const image = await prepareAvatar(file);
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(avatarPath(user.id), image, {
          upsert: true,
          contentType: image.type,
          cacheControl: "3600",
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avatar"] }),
    onError: (error) => {
      if (isAvatarStorageUnavailable(error)) {
        queryClient.setQueriesData<AvatarState>({ queryKey: ["avatar"] }, () => ({
          status: "unavailable",
        }));
      }
    },
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([avatarPath(user.id)]);
      if (error) throw error;
      // remove() reports success even when RLS hid the object; only an actual deletion counts.
      if (!data?.length) throw new Error("Photo was not removed");
    },
    onSuccess: () => {
      queryClient.setQueriesData<AvatarState>({ queryKey: ["avatar"] }, () => ({
        status: "none",
      }));
    },
  });
}
