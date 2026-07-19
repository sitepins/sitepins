import { ImageContext } from "@/contexts/image-context";
import { useContext } from "react";

export const useImages = () => {
  const context = useContext(ImageContext);
  if (!context) {
    throw new Error("useImages must be used within an ImageProvider");
  }
  return context;
};
