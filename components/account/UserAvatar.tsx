"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

interface UserAvatarProps {
  name: string;
  imageUrl: unknown;
  size?: "small" | "large";
}

function safeGoogleAvatarUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

function initialsFor(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toLocaleUpperCase("es-AR");

  return initials || "L";
}

export function UserAvatar({ name, imageUrl, size = "small" }: UserAvatarProps) {
  const avatarUrl = useMemo(() => safeGoogleAvatarUrl(imageUrl), [imageUrl]);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const large = size === "large";
  const dimensions = large ? "h-14 w-14 text-base" : "h-7 w-7 text-[10px]";
  const imageSize = large ? "56px" : "28px";

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-borde-fuerte bg-acero-tenue font-black text-texto ${dimensions}`} aria-hidden>
      {avatarUrl && failedUrl !== avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          fill
          sizes={imageSize}
          className="object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        initialsFor(name)
      )}
    </span>
  );
}
