import { type ReactNode } from "react";
import { createPortal } from "react-dom";

export function renderPortal(node: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
