import type { ReactNode } from "react";

export function CenterMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <p className="max-w-sm text-center text-sm text-fg-3">{children}</p>
    </div>
  );
}
