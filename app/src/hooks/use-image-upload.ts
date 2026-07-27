import { updateImage } from "@/actions/user";
import { IS_DEMO } from "@/lib/constant";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { FileRejection } from "react-dropzone";
import { toast } from "sonner";

interface UseImageUploadOptions {
  folder: "sitepins/users" | "sitepins/orgs" | "sitepins/sites";
  onError?: (message: string) => void;
  onSelectFile?: (file: File) => void;
}

interface UseImageUploadReturn {
  file: File | null;
  previewSrc: string | undefined;
  isUploading: boolean;
  fileRejections: FileRejection[];
  handleFileSelect: (files: File[]) => void;
  handleFileReject: (rejections: FileRejection[]) => void;
  uploadFile: () => Promise<string | undefined>;
  reset: () => void;
}

export function useImageUpload({
  folder,
  onError,
  onSelectFile,
}: UseImageUploadOptions): UseImageUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const [fileRejections, setFileRejections] = useState<FileRejection[]>([]);
  const tFeedback = useTranslations("common.feedback");

  const handleFileSelect = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      if (IS_DEMO) {
        toast.error(tFeedback("demo_mode"));
        return;
      }

      setFileRejections([]);
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        setPreviewSrc(event?.target?.result as string);
      };
      fileReader.readAsDataURL(files[0]);
      setFile(files[0]);
      if (typeof onSelectFile === "function") {
        onSelectFile(files[0]);
      }
    },
    [onSelectFile, tFeedback],
  );

  const handleFileReject = useCallback((rejections: FileRejection[]) => {
    setFileRejections(rejections);
  }, []);

  const uploadFile = useCallback(async (): Promise<string | undefined> => {
    if (!file) return undefined;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("permission", "public-read");
      formData.append("folder", folder);
      formData.append("file", file);

      const response = await updateImage(formData);

      if (response.isError) {
        const errorMessage = response.message || tFeedback("upload_failed");
        onError?.(errorMessage);
        toast.error(errorMessage);
        return undefined;
      }

      if (response.data?.key) {
        return response.data.key;
      }

      return undefined;
    } finally {
      setIsUploading(false);
    }
  }, [file, folder, onError, tFeedback]);

  const reset = useCallback(() => {
    setFile(null);
    setPreviewSrc(undefined);
    setFileRejections([]);
  }, []);

  return {
    file,
    previewSrc,
    isUploading,
    fileRejections,
    handleFileSelect,
    handleFileReject,
    uploadFile,
    reset,
  };
}
