"use client";

import Avatar from "@/components/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/auth-client";
import { IS_DEMO } from "@/lib/constant";
import { getFooterAccountMenu } from "@/lib/menu";
import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SidebarProfileSetting() {
  const locale = useLocale();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);

  const tCommon = useTranslations("common");
  const footerAccountMenu = getFooterAccountMenu(locale);

  const handleSignout = async () => {
    if (IS_DEMO) {
      toast.error(tCommon("logout.demo_disabled"));
      return;
    }
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  };

  // session data for the current logged in user
  const { data: auth } = authClient.useSession();

  // theme handling via next-themes
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={"basic"}
            className="hover:bg-background flex h-12 w-full items-center justify-between space-x-1 whitespace-normal"
          >
            <div className="flex flex-1 items-center justify-between space-x-2 text-left">
              <Avatar
                className="size-8 rounded-full"
                src={auth?.user.image || ""}
                alt={auth?.user.full_name || tCommon("labels.user")}
                email={auth?.user.email || ""}
                width={32}
                height={32}
              />
              <span className="flex-1">
                <span className="text-text-dark wrap-break-words line-clamp-1 block flex-1 break-all whitespace-normal">
                  {auth?.user.full_name ?? tCommon("labels.user")}
                </span>
                <span className="line-clamp-1 text-xs">{auth?.user.email}</span>
              </span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          sideOffset={10}
          collisionPadding={10}
          className="bg-background w-62 px-1"
        >
          <div className="flex flex-col gap-1">
            {footerAccountMenu.map((item) => {
              return (
                <DropdownMenuItem
                  key={item.name}
                  asChild
                  className="cursor-pointer"
                >
                  <Link
                    href={item.href as string}
                    target={
                      (item.href as string).startsWith("http")
                        ? "_blank"
                        : "_self"
                    }
                    rel={
                      (item.href as string).startsWith("http")
                        ? "noopener nofollow"
                        : ""
                    }
                    className="flex w-full items-center px-3 py-1.5"
                    onClick={() => setIsOpen(false)}
                  >
                    <item.icon className="mr-1 size-4" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer px-3 py-1.5"
              onClick={() => {
                setIsOpen(false);
                setShowLogoutAlert(true);
              }}
            >
              <LogOut className="mr-1 size-4" />
              <span className="text-sm">{tCommon("logout.label")}</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showLogoutAlert} onOpenChange={setShowLogoutAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tCommon("logout.confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon("logout.confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant={"destructive"} onMouseDown={handleSignout}>
                {tCommon("logout.label")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
