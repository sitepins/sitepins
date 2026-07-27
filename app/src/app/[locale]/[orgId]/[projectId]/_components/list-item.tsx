import { cn } from "@/lib/utils/cn";
import { Reorder, useDragControls, useMotionValue } from "motion/react";
import { GripVertical } from "lucide-react";

export default function ListItem({
  children,
  value,
  listKey,
  className,
}: {
  children: React.ReactNode;
  value: any;
  listKey: string;
  className?: string;
}) {
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={value}
      style={{ y }}
      key={listKey}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        "bg-background flex cursor-grab items-center px-2 py-2 pl-2 last:border-b-0",
        className,
      )}
    >
      <span
        className="touch-none"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <GripVertical />
      </span>
      {children}
    </Reorder.Item>
  );
}
