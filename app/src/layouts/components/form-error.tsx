import { TSubmitFormState } from "@/actions/utils";
import { BetterFetchError } from "better-auth/react";
import { TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./ui/button";

type TError = {
  path: string;
  message: string;
};

type FormErrorProps = Omit<Partial<TSubmitFormState<unknown>>, "error"> & {
  error?: (BetterFetchError & Record<string, unknown>) | TError[] | null;
  onReset?: () => void;
};

export default function FormError({
  error: errors,
  isError = false,
  message,
  onReset,
}: FormErrorProps) {
  const derivedErrors = useMemo<TError[]>(() => {
    if (Array.isArray(errors) && errors.length > 0) return errors;

    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      const err = errors as BetterFetchError;
      return [
        {
          path: "",
          message:
            err.message ||
            "Server Temporarily Unavailable. Please try again later.",
        },
      ];
    }

    if (isError) {
      return [{ path: "", message: message || "Something went wrong" }];
    }

    return [];
  }, [errors, isError, message]);

  // Seeded from props but locally dismissable, so a fresh set of errors has to
  // clear any dismissals — done during render rather than in an effect.
  const [errorList, setErrorList] = useState(derivedErrors);
  const [syncedErrors, setSyncedErrors] = useState(derivedErrors);
  if (syncedErrors !== derivedErrors) {
    setSyncedErrors(derivedErrors);
    setErrorList(derivedErrors);
  }

  if (errorList.length === 0) return null;

  return (
    <ul className="bg-destructive/10 text-destructive/80 mt-3 grid gap-3 rounded-lg p-3">
      {errorList.map((err, index) => (
        <li
          key={index}
          className="relative flex items-center gap-2 text-sm font-semibold"
        >
          <TriangleAlert />
          <span className="flex-1 text-pretty wrap-break-word">
            {err.message}
          </span>
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
