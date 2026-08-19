"use client";

import { type PlateElementProps, PlateElement } from "platejs/react";

export function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      className="my-1 border-s-2 ps-6 italic"
      {...props}
    />
  );
}
