import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { getFileNameAndExtension } from "@/lib/utils/common";
import { TFiles } from "@/types";
import { FileQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

type TNewImage = Omit<TFiles, "children" | "isFile" | "isNew" | "sha"> & {
  isAlreadyExist: boolean;
  content: string;
  number: number;
};

const MediaConflictHandler = ({
  images,
  setImages,
  className,
}: {
  images: TNewImage[];
  setImages: React.Dispatch<React.SetStateAction<TNewImage[]>>;
  className?: string;
}) => {
  const tMediaConflict = useTranslations("media.conflict");

  function replace(name: string) {
    setImages((images) => {
      return images.map((image) => {
        if (image.name === name) {
          return {
            ...image,
            isAlreadyExist: false,
            isReplace: true,
            isNew: false,
          };
        }
        return { ...image };
      });
    });
  }

  function stop(name: string) {
    setImages((images) => {
      return images.filter((image) => image.name !== name);
    });
  }

  function keepBoth(name: string) {
    setImages((images) => {
      return images.map((image) => {
        if (image.name === name) {
          let [fileName, extension] = getFileNameAndExtension(name);
          fileName =
            fileName + "_copy(" + (image.number + 1) + ")." + extension;
          return {
            ...image,
            name: fileName,
            path: image.path,
            isNew: true,
            isAlreadyExist: false,
            isReplace: false,
          };
        }
        return image;
      });
    });
  }

  const currentImage = images[0];
  const isOpen = images.length > 0;

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className={cn("z-10000 max-w-lg", className)}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FileQuestion className="text-destructive size-5" />
            {tMediaConflict("title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {images.length > 1
              ? tMediaConflict("multiple_files", { count: images.length })
              : tMediaConflict("single_file", { name: currentImage?.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {currentImage && (
          <div className="border-border border-y py-4">
            <p className="text-sm font-medium">`{currentImage.name}`</p>
          </div>
        )}

        <AlertDialogFooter className="flex items-center gap-2 pt-2">
          <Button
            onClick={() => currentImage && stop(currentImage.name)}
            type="button"
            variant="outline"
            size="sm"
            className="mr-auto"
          >
            {tMediaConflict("stop")}
          </Button>
          <Button
            onClick={() => currentImage && keepBoth(currentImage.name)}
            type="button"
            variant="outline"
            size="sm"
          >
            {tMediaConflict("keep_both")}
          </Button>
          <Button
            onClick={() => currentImage && replace(currentImage.name)}
            type="button"
            variant="default"
            size="sm"
          >
            {tMediaConflict("replace")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MediaConflictHandler;
