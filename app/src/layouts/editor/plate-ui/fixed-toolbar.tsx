"use client";

import { cn } from "@/lib/utils/cn";
import { useEffect, useRef, useState } from "react";
import { Toolbar } from "./toolbar";

export function FixedToolbar({
  className,
  ...props
}: React.ComponentProps<typeof Toolbar>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const scrollContainer = wrapper?.parentElement;
    if (!scrollContainer) return;

    const handleScroll = () => {
      setIsScrolled(scrollContainer.scrollTop > 0);
    };

    handleScroll();
    scrollContainer.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "bg-background before:bg-background sticky top-0 left-0 z-50 w-full pb-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4 lg:pb-6 lg:before:-top-6 lg:before:h-6 2xl:-mx-6 2xl:w-[calc(100%+3rem)] 2xl:px-6",
        isScrolled && "shadow-md",
      )}
    >
      <Toolbar
        {...props}
        className={cn(
          "scrollbar-hide bg-background border-border w-full justify-between overflow-x-auto rounded-lg border p-1",
          className,
        )}
      />
    </div>
  );
}
