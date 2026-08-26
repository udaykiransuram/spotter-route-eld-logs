import { createElement } from "react";
import type { StopType } from "../types";

export type StopIconType = StopType | "start" | "finish";

type SvgTag = "line" | "path" | "polygon" | "polyline";
type SvgShape = readonly [SvgTag, Readonly<Record<string, string>>];

const iconShapes: Record<StopIconType, readonly SvgShape[]> = {
  pickup: [
    ["path", { d: "m16 16 2 2 4-4" }],
    ["path", { d: "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" }],
    ["path", { d: "m7.5 4.27 9 5.15" }],
    ["polyline", { points: "3.29 7 12 12 20.71 7" }],
    ["line", { x1: "12", x2: "12", y1: "22", y2: "12" }],
  ],
  dropoff: [
    ["path", { d: "M12 22v-9" }],
    ["path", { d: "M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z" }],
    ["path", { d: "M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13" }],
  ],
  fuel: [
    ["line", { x1: "3", x2: "15", y1: "22", y2: "22" }],
    ["line", { x1: "4", x2: "14", y1: "9", y2: "9" }],
    ["path", { d: "M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" }],
    ["path", { d: "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" }],
  ],
  break: [
    ["path", { d: "M10 2v2" }],
    ["path", { d: "M14 2v2" }],
    ["path", { d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" }],
    ["path", { d: "M6 2v2" }],
  ],
  meal_break: [
    ["path", { d: "M3 2v7a3 3 0 0 0 6 0V2" }],
    ["path", { d: "M6 2v20" }],
    ["path", { d: "M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Zm0 0v7" }],
  ],
  rest: [
    ["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }],
  ],
  cycle_restart: [
    ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
    ["path", { d: "M3 3v5h5" }],
  ],
  pretrip_inspection: [
    ["path", { d: "M9 11l3 3L22 4" }],
    ["path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" }],
  ],
  start: [
    ["polygon", { points: "3 11 22 2 13 21 11 13 3 11" }],
  ],
  finish: [
    ["path", { d: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" }],
    ["line", { x1: "4", x2: "4", y1: "22", y2: "15" }],
  ],
};

interface StopTypeIconProps {
  className?: string;
  size?: number;
  type: StopIconType;
}

const svgPresentation = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
} as const;

export function StopTypeIcon({ className, size = 16, type }: StopTypeIconProps) {
  return createElement(
    "svg",
    { ...svgPresentation, "aria-hidden": true, className, height: size, width: size },
    iconShapes[type].map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index })),
  );
}

export function createStopTypeIconElement(type: StopIconType, className: string) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  svg.setAttribute("fill", "none");
  svg.setAttribute("height", "16");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");

  for (const [tag, attributes] of iconShapes[type]) {
    const shape = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}
