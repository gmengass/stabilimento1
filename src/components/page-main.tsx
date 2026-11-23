import type { ComponentProps } from "react";

export const MAIN_CONTENT_ID = "main-content";

/** A page's main landmark, where the layout's "Skip to content" link moves focus. */
type Props = Omit<ComponentProps<"main">, "id" | "tabIndex">;

export function PageMain({ className = "", ...props }: Props) {
  return (
    <main
      {...props}
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className={`focus:outline-none ${className}`}
    />
  );
}
