import { TSubmitFormState } from "@/actions/utils";
import { BetterFetchError } from "better-auth/react";
import { TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type TError = {
  path: string;
  message: string;
};

interface FormErrorProps extends Omit<Partial<TSubmitFormState<any>>, "error"> {
  error?: (BetterFetchError & Record<string, any>) | TError[] | null;
  onReset?: () => void;
}

export default function FormError({
  error: errors,
  isError = false,
  message,
  onReset,
}: FormErrorProps) {
  const [errorList, setErrorList] = useState<TError[]>([]);

  useEffect(() => {
    if (Array.isArray(errors)) {
      setErrorList(errors);
    } else if (errors && typeof errors === "object") {
      // Handle BetterFetchError or single error object
      const err = errors as BetterFetchError;
      setErrorList([
        {
          path: "",
          message:
            err.message ||
            "Server Temporarily Unavailable. Please try again later.",
        },
      ]);
    } else if (isError) {
      setErrorList([
        {
          path: "",
          message: message || "Something went wrong",
        },
      ]);
    } else {
      setErrorList([]);
    }
  }, [isError, message, errors]);

  if (errorList.length === 0) return null;

  return (
    <ul className="bg-destructive/10 text-destructive/80 mt-3 grid gap-3 rounded-lg p-3">
      {errorList.map((err, index) => (
        <li
          key={index}
          className="relative flex items-center space-x-2 text-sm font-semibold"
        >
          <TriangleAlert />
          <span className="flex-1">{err.message}</span>
          <div>
            <Button
              type="button"
              variant={"basic"}
              className="border-destructive flex size-6 flex-none items-center justify-center rounded-full border"
              size={"icon"}
              onClick={() => {
                if (onReset) {
                  onReset();
                } else {
                  setErrorList((prev) => prev.filter((_, i) => i !== index));
                }
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
