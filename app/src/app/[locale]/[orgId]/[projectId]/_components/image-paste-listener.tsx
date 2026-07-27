import { TImage } from "@/contexts/image-context";
import { useImages } from "@/hooks/use-images";
import { useEffect } from "react";

export const ImagePasteListener: React.FC = () => {
  const { addImage } = useImages();

  useEffect(() => {
    const handleImagePaste = (event: CustomEvent<TImage>) => {
      const imageItem = event.detail;
      addImage(imageItem);
    };

    // Listen for image paste events
    window.addEventListener("image-pasted", handleImagePaste as EventListener);

    return () => {
      window.removeEventListener(
        "image-pasted",
        handleImagePaste as EventListener,
      );
    };
  }, [addImage]);

  return null; // This component doesn't render anything
};
