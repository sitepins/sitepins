import { cn } from "@/lib/utils/cn";
import type { LucideIcon } from "lucide-react";
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Plus,
} from "lucide-react";
import { SVGProps } from "react";

export type Icon = LucideIcon;

const RawMarkdown = () => {
  return (
    <svg
      fill="currentColor"
      height="1em"
      role="img"
      stroke="currentColor"
      strokeWidth={0}
      viewBox="0 0 24 24"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title />
      <path d="M22.27 19.385H1.73A1.73 1.73 0 010 17.655V6.345a1.73 1.73 0 011.73-1.73h20.54A1.73 1.73 0 0124 6.345v11.308a1.73 1.73 0 01-1.73 1.731zM5.769 15.923v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.078h-2.308l-2.307 2.885-2.308-2.885H3.46v7.847zM21.232 12h-2.309V8.077h-2.307V12h-2.308l3.461 4.039z" />
    </svg>
  );
};

const HeadingIcon = (props: SVGProps<SVGSVGElement> & { title?: string }) => {
  const title = props.title || "format size";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-5", props.className)}
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const QuoteIcon = (props: SVGProps<SVGSVGElement> & { title?: string }) => {
  const title = props.title || "format quote";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const LinkIcon = (props: SVGProps<SVGSVGElement> & { title?: string }) => {
  const title = props.title || "insert link";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.71-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const CodeIcon = (props: SVGProps<SVGSVGElement> & { title?: string }) => {
  const title = props.title || "code";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const CodeBlockIcon = (
  props: SVGProps<SVGSVGElement> & {
    title?: string;
  },
) => {
  const title = props.title || "code-block";

  return (
    <svg
      fill="currentColor"
      height="1em"
      stroke="currentColor"
      strokeWidth={0}
      viewBox="0 0 16 16"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z" />
      <path d="M6.854 4.646a.5.5 0 0 1 0 .708L4.207 8l2.647 2.646a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0zm2.292 0a.5.5 0 0 0 0 .708L11.793 8l-2.647 2.646a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708 0z" />
    </svg>
  );
};

const ImageIcon = (
  props: SVGProps<SVGSVGElement> & {
    title?: string;
  },
) => {
  const title = props.title || "image";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M19 5v14H5V5h14zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const BoldIcon = (
  props: SVGProps<SVGSVGElement> & {
    title?: string;
  },
) => {
  const title = props.title || "format bold";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const ItalicIcon = (
  props: SVGProps<SVGSVGElement> & {
    title?: string;
  },
) => {
  const title = props.title || "format italic";

  return (
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
    >
      <title>{title}</title>
      <g fill="none">
        <path
          d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const Overflow = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className="size-5"
    {...props}
  >
    <path
      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  </svg>
);

export const Icons = {
  add: Plus,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  h5: Heading5,
  h6: Heading6,
  bold: BoldIcon,
  code: CodeIcon,
  codeBlock: CodeBlockIcon,
  heading: HeadingIcon,
  image: ImageIcon,
  italic: ItalicIcon,
  link: LinkIcon,
  overflow: Overflow,
  quote: QuoteIcon,
  raw: RawMarkdown,
};
