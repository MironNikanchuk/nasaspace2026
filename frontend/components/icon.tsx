"use client";

import { Icon as Iconify } from "@iconify/react";
import type { IconifyIcon } from "@iconify/react";
import pack from "@iconify-json/gg/icons.json";

const icons: Record<string, Partial<IconifyIcon> | undefined> = pack.icons;
export function Icon({ name, width = 18, className }: { name: string; width?: number; className?: string }) {
  const icon = icons[name];
  if (!icon?.body) return null;
  return <Iconify icon={{ width: pack.width, height: pack.height, ...icon, body: icon.body }} width={width} className={className} aria-hidden />;
}
