import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-sm border border-[#d7ccbb] bg-[#fffdf8] px-3 py-2 font-mono text-sm text-[#1c1610] placeholder:text-[#1c1610]/40 outline-none focus-visible:ring-2 focus-visible:ring-[#8b2e12]/35",
        className,
      )}
      {...props}
    />
  );
}
