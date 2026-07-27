import { useState } from "react";

export const useDialog = () => {
  const [isOpen, setOpen] = useState(false);

  const onOpenChange = (_value = !isOpen) => {
    setOpen(_value);
  };

  return { isOpen, onOpenChange };
};
