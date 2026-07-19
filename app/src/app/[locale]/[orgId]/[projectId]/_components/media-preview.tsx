import MediaPopupList from "@/components/media-popup-list";
import { Button } from "@/components/ui/button";
import { MediaPreviewBox } from "@/components/media-preview-box";
import { Camera, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

export default function MediaPreview({
  value,
  name,
  handleChange,
  handleDelete,
}: {
  value: string;
  name: string;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDelete?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tMedia = useTranslations("media");

  return (
    <div className="w-full gap-x-4 lg:inline-flex">
      {value ? (
        <div
          className={
            "group after:bg-primary/40 relative w-full max-w-sm rounded-lg after:invisible after:absolute after:top-0 after:left-0 after:z-20 after:hidden after:h-full after:w-full after:origin-center after:scale-0 after:rounded-[inherit] after:opacity-0 after:transition-all after:duration-300 after:content-[''] hover:after:visible hover:after:scale-100 hover:after:opacity-100"
          }
        >
          <MediaPreviewBox value={value}>
            <MediaPopupList
              ref={buttonRef}
              name={name}
              path={value}
              type="button"
              onChangeHandler={handleChange}
              className="invisible absolute top-1/2 left-1/2 z-30 hidden -translate-x-1/2 -translate-y-1/2 cursor-pointer opacity-0 transition-opacity duration-300 group-hover:visible group-hover:opacity-100 md:block"
            />
          </MediaPreviewBox>
        </div>
      ) : (
        <MediaPopupList
          name={name}
          path={value}
          type="button"
          onChangeHandler={handleChange}
          triggerButton={
            <div className="cursor-pointer">
              <MediaPreviewBox className="h-full w-full" value={value}>
                <Button
                  ref={buttonRef}
                  type="button"
                  variant={"link"}
                  className="px-0 focus:border-none focus:ring-transparent focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 focus-visible:outline-none"
                >
                  {tMedia("click_to_change")}
                </Button>
              </MediaPreviewBox>
            </div>
          }
        />
      )}

      <div className="mt-4 flex max-w-96.25 space-x-2.5 lg:mt-0">
        <Button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            buttonRef.current?.click();
          }}
          className="flex-1 space-x-2 lg:ml-2 lg:hidden"
        >
          <Camera />

          <span>{tMedia("replace")}</span>
        </Button>

        <Button
          disabled={!value}
          className="hover:text-destructive/75"
          type="button"
          size={"icon"}
          variant={"outline"}
          onClick={handleDelete}
        >
          <Trash2 className="size-6" />
        </Button>
      </div>
    </div>
  );
}
