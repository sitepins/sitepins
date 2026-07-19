"use client";

import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { SUPPORT_URL } from "@/lib/brand";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function Error({
  error,
}: {
  error: Error & { digest?: string; message?: string };
}) {
  const router = useRouter();
  const tCommonErrorPage = useTranslations("common.error_page");

  return (
    <section className="flex min-h-screen flex-col">
      <main className="bg-light flex flex-1 items-center justify-center">
        <div className="w-full p-10">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="border-border bg-background rounded-lg border p-8">
              <div className="mb-8 flex items-center justify-center">
                <Logo />
              </div>
              <h2 className="text-destructive mb-6 text-center text-lg font-semibold">
                {error?.message || tCommonErrorPage("something_went_wrong")}
              </h2>
              {error?.digest && (
                <p className="text-muted-foreground mb-4 text-center text-sm">
                  {tCommonErrorPage("error_code", { code: error.digest })}
                </p>
              )}
              <div className="mb-4 space-x-2 text-center">
                <Button onClick={() => router.push("/")}>
                  {tCommonErrorPage("go_home")}
                </Button>
                <Button variant="outline">
                  <Link
                    href={SUPPORT_URL}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center"
                  >
                    {tCommonErrorPage("contact_support")}{" "}
                    <ExternalLink className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>
              <details className="text-muted-foreground border-border border-t pt-4 text-xs">
                <summary className="cursor-pointer">
                  {tCommonErrorPage("show_technical_details")}
                </summary>
                <pre className="mt-2 max-h-[40vh] overflow-auto text-xs whitespace-pre-wrap">
                  {error?.stack}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}
