import { createContext, useState } from "react";

export interface TImage {
  path: string;
  content: string;
  isLoading?: boolean;
  error?: string;
}

export interface TImageContext {
  images: TImage[];
  addImage: (item: TImage) => void;
  removeImage: (path: string) => void;
  getImage: (path: string) => TImage | undefined;
  clearImages: () => void;
}

export const ImageContext = createContext<TImageContext>(null!);

export const ImageProvider = ({ children }: { children: React.ReactNode }) => {
  const [images, setImages] = useState<TImage[]>([]);

  const addImage = (item: TImage) => {
    setImages((prev) => {
      // Check if image with this path already exists
      const existingIndex = prev.findIndex((image) => image.path === item.path);
      if (existingIndex !== -1) {
        // Update existing image
        const updated = [...prev];
        updated[existingIndex] = item;
        return updated;
      }
      // Add new image
      const newImages = [...prev, item];
      return newImages;
    });
  };

  const removeImage = (path: string) => {
    setImages((prev) => prev.filter((item) => item.path !== path));
  };

  const getImage = (path: string): TImage | undefined => {
    return images.find((item) => item.path === path);
  };

  const clearImages = () => {
    setImages([]);
  };

  const value: TImageContext = {
    images,
    addImage,
    removeImage,
    getImage,
    clearImages,
  };

  return (
    <ImageContext.Provider value={value}>{children}</ImageContext.Provider>
  );
};
