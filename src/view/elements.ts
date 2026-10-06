// Builders for display elements, so screens read as layout rather than as object literals.

import { SCREEN_H, SCREEN_W } from "../config.ts";
import type { device } from "../device.ts";

type Elements = NonNullable<Parameters<typeof device.DisplayDraw>[0]["elements"]>;
/** One thing on the display, as device.DisplayDraw expects it. */
export type Elem = Elements[number];

type Align = "top_left" | "top_mid" | "center";
type Font = Extract<Elem, { type: "text" }>["font"];

type RectOptions = { align?: Align; radius?: number; border?: string; z?: number };

/** A filled rectangle; `border` adds a 1px outline of that colour. */
export function rect(id: string, x: number, y: number, width: number, height: number, fill: string, o: RectOptions = {}): Elem {
  return {
    id,
    type: "rectangle",
    x,
    y,
    align: o.align ?? "center",
    width,
    height,
    radius: o.radius ?? 0,
    fill: "solid",
    fill_colors: [fill],
    border_width: o.border ? 1 : 0,
    ...(o.border ? { border_color: o.border } : {}),
    z_index: o.z ?? 0,
  };
}

/** The whole screen in one colour. */
export function background(id: string, fill: string): Elem {
  return rect(id, 0, 0, SCREEN_W, SCREEN_H, fill, { align: "top_left" });
}

export function text(id: string, x: number, y: number, content: string, font: Font, color: string, align: Align = "center", z = 0): Elem {
  return { id, type: "text", x, y, align, text: content, font, color, z_index: z };
}

export function bitmap(id: string, x: number, y: number, data: string, align: Align = "center", z = 0): Elem {
  return { id, type: "xpmbitmap", x, y, align, data, z_index: z };
}
