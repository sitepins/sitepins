import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SiGithub, SiYoutube } from "@icons-pack/react-simple-icons";
import { GitFork, Link2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function GitHubIntegration({
  handleClick,
}: {
  handleClick: () => void;
}) {
  const [allowAllRepos, setAllowAllRepos] = useState(false);
  const searchParams = useSearchParams();
  const repository = searchParams.get("repository");
  const pathname = usePathname();
  const isImport = pathname === "/new/import";
  const tProviderInstallGithubIntegration = useTranslations(
    "provider-install.github_integration",
  );

  return (
    <div className="text-center">
      {/* icons */}
      <div className="mb-8 flex items-center justify-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-black">
          <Image
            src="/images/logo-icon.svg"
            alt="App Logo"
            width={40}
            height={40}
            className="size-10 object-contain"
          />
        </div>
        <div className="bg-light flex size-10 items-center justify-center rounded-lg">
          <Link2Icon className="text-text-dark size-5" />
        </div>
        <div className="flex size-14 items-center justify-center rounded-2xl bg-black">
          <SiGithub className="size-8 text-white" />
        </div>
      </div>

      <h2 className="text-h4 text-text-dark mb-2 font-bold tracking-tight">
        {tProviderInstallGithubIntegration("title")}
      </h2>
      <p className="text-muted-foreground mx-auto max-w-xs text-sm">
        {tProviderInstallGithubIntegration("description")}
      </p>

      <div className="mt-8 flex flex-col items-center space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="allow-repos"
            checked={allowAllRepos}
            onCheckedChange={(checked) => setAllowAllRepos(Boolean(checked))}
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="allow-repos"
              className="cursor-pointer text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {tProviderInstallGithubIntegration.rich("allow_all_repos", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </label>
          </div>
        </div>

        <Button
          onClick={() => allowAllRepos && handleClick()}
          size="xl"
          disabled={!allowAllRepos}
        >
          {tProviderInstallGithubIntegration("connect_btn")}
          <GitFork className="ml-2 size-4 transition-transform" />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="xs"
              variant="link"
              className={
                (allowAllRepos ? "opacity-50" : "opacity-100") + " underline"
              }
            >
              {tProviderInstallGithubIntegration("grant_access_link")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tProviderInstallGithubIntegration("selective_title")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-muted-foreground space-y-3 text-sm">
                  <p>
                    {tProviderInstallGithubIntegration.rich("selective_desc1", {
                      span: (chunks) => (
                        <span className="text-foreground font-medium">
                          {chunks}
                        </span>
                      ),
                    })}
                  </p>
                  <p>{tProviderInstallGithubIntegration("selective_desc2")}</p>
                  <ol className="list-inside list-decimal space-y-1.5 pl-1">
                    {isImport ? (
                      <li>
                        {tProviderInstallGithubIntegration.rich(
                          "step_download",
                          {
                            span: (chunks) => (
                              <span className="text-foreground font-medium">
                                {chunks}
                              </span>
                            ),
                          },
                        )}
                      </li>
                    ) : (
                      <li>
                        {tProviderInstallGithubIntegration.rich("step_fork", {
                          span: (chunks) => (
                            <span className="text-foreground font-medium">
                              {chunks}
                            </span>
                          ),
                          link: (chunks) => (
                            <Link
                              href={repository + "/fork"}
                              target="_blank"
                              className="text-primary underline underline-offset-4"
                            >
                              {chunks}
                            </Link>
                          ),
                        })}
                      </li>
                    )}

                    {isImport && (
                      <li>{tProviderInstallGithubIntegration("step_push")}</li>
                    )}

                    <li>
                      {tProviderInstallGithubIntegration.rich("step_go_to", {
                        link: (chunks) => (
                          <Link
                            href="/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-4"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </li>
                    <li>
                      {tProviderInstallGithubIntegration.rich("step_new_site", {
                        span: (chunks) => (
                          <span className="text-foreground font-medium">
                            {chunks}
                          </span>
                        ),
                      })}
                    </li>
                    {isImport ? (
                      <li>
                        {tProviderInstallGithubIntegration.rich(
                          "step_grant_access",
                          {
                            span: (chunks) => (
                              <span className="text-foreground font-medium">
                                {chunks}
                              </span>
                            ),
                          },
                        )}
                      </li>
                    ) : (
                      <li>
                        {tProviderInstallGithubIntegration.rich(
                          "step_grant_forked",
                          {
                            span: (chunks) => (
                              <span className="text-foreground font-medium">
                                {chunks}
                              </span>
                            ),
                          },
                        )}
                      </li>
                    )}

                    <li>
                      {tProviderInstallGithubIntegration.rich("step_final", {
                        span: (chunks) => (
                          <span className="text-foreground font-medium">
                            {chunks}
                          </span>
                        ),
                      })}
                    </li>
                  </ol>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {tProviderInstallGithubIntegration("close")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-muted-foreground">
          {tProviderInstallGithubIntegration.rich("revoke_access", {
            link: (chunks) => (
              <a
                href="https://github.com/settings/installations"
                className="text-text-dark underline hover:opacity-80"
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <a
          href="https://youtu.be/ZnEwKFY3rQk?si=VKD-WFJpTA3SsuU9"
          className="text-text-dark hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          <SiYoutube className="-mt-0.5 mr-2 inline-block size-5" />{" "}
          {tProviderInstallGithubIntegration("watch_tutorial")}
        </a>
      </div>
    </div>
  );
}
