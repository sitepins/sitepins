import { type SlateElementProps, SlateElement } from "platejs/static";

export function BlockquoteElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      as="blockquote"
      className="my-1 border-s-2 ps-6 italic"
      {...props}
    />
  );
}
