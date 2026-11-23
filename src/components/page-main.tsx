import type { ComponentProps } from "react";

export const MAIN_CONTENT_ID = "main-content";

/** A page's main landmark, where the layout's "Skip to content" link moves focus. */
export function PageMain({ className = "", ...props }: ComponentProps<"main">) {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className={`focus:outline-none ${className}`}
      {...props}
    />
  );
}
