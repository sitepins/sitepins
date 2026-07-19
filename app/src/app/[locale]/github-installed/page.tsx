"use client";

import Loading from "@/components/loading";
import Logo from "@/components/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export default function GitHubInstalled() {
  const tProviderInstall = useTranslations("provider-install");
  const params = useSearchParams();
  const [isLoading, startTransition] = useTransition();
  const isAlreadyExit = useRef<boolean>(false);
  const isRequest = params.get("setup_action") === "request";

  useEffect(() => {
    if (!isAlreadyExit.current) {
      startTransition(async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1400));
          await fetch(`/api/auth/github?${params.toString()}`);
        } catch (e) {
          // ignore errors during background auth call
        } finally {
          try {
            window.close();
          } catch (e) {
            /* window may not be closable in some contexts */
          }
        }
      });
      isAlreadyExit.current = true;
    }
  }, [params, startTransition]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center">
          <Logo className="h-10 w-auto" />
        </div>

        <Card className="overflow-hidden shadow-lg">
          <CardHeader>
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <div>
                {isLoading ? (
                  <div className="text-primary-foreground bg-primary flex h-14 w-14 items-center justify-center rounded-full">
                    <Loading
                      className="p-0"
                      center={false}
                      sizeClass="size-6"
                      ariaLabel={tProviderInstall("authenticating_aria")}
                    />
                  </div>
                ) : isRequest ? (
                  <div className="text-accent-foreground bg-accent flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold">
                    <Check />
                  </div>
                ) : (
                  <div className="text-primary-foreground bg-primary flex h-14 w-14 items-center justify-center rounded-full font-medium">
                    <SiGithub />
                  </div>
                )}
              </div>

              <CardContent className="p-0">
                <h3 className="text-xl font-semibold">
                  {isRequest
                    ? tProviderInstall("request_title")
                    : tProviderInstall("auth_title", {
                        provider: tProviderInstall("providers.github"),
                      })}
                </h3>
                <CardDescription className="mx-auto mt-2 max-w-xl text-sm">
                  {isRequest
                    ? tProviderInstall("request_description")
                    : tProviderInstall("auth_description", {
                        provider: tProviderInstall("providers.github"),
                      })}
                </CardDescription>
                <p className="text-muted-foreground mt-3 text-xs">
                  {tProviderInstall("manual_close_hint")}
                </p>
              </CardContent>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
