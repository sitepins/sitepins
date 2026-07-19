"use client";

import { NavLink } from "@/components/nav-link";
import SidebarProfileSetting from "@/components/sidebar-profile-setting";
import { SidebarUpgrade } from "@/components/sidebar-upgrade";
import { TrialBanner } from "@/components/trial-banner";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import type { TOrg } from "@/redux/features/orgs/type";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import path from "path";
import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useContext } from "react";
import MobileHeader from "./mobile-header";

export const SidebarContext = createContext<{ isMobile?: boolean }>({});

// sidebar page layout type
type SidebarPageLayoutProps = {
  sidebar: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
};

// sidebar page layout
export function SidebarPageLayout({
  sidebar,
  header,
  children,
  mainClassName,
}: SidebarPageLayoutProps) {
  const pathname = usePathname();

  // Check if this is a file editing route (has file extension in path)
  const fileExtension = path.extname(pathname);
  const isFileEditingRoute = Boolean(fileExtension);

  // Default classes based on route type
  const defaultMainClasses = isFileEditingRoute
    ? "h-full max-h-svh px-0 py-0 flex flex-col"
    : "h-full flex-1 p-4 xl:p-8 2xl:px-14 flex flex-col";

  return (
    <div className="flex">
      <div className="hidden w-full max-w-70 xl:block">{sidebar}</div>
      <div className="flex min-h-svh w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <MobileHeader>
          <SidebarContext.Provider value={{ isMobile: true }}>
            {sidebar}
          </SidebarContext.Provider>
        </MobileHeader>
        <TrialBanner />
        {header && <div className="w-full">{header}</div>}
        <main className={cn(defaultMainClasses, mainClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}

// sidebar layout type
interface SidebarLayoutProps extends HTMLAttributes<HTMLElement> {
  header?: ReactNode;
  headerClassName?: string;
  navClassName?: string;
  footer?: ReactNode;
  footerClassName?: string;
  children: ReactNode;
}

// sidebar layout
export function SidebarLayout({
  header,
  headerClassName,
  navClassName,
  footer,
  footerClassName,
  className,
  children,
  ...rest
}: SidebarLayoutProps) {
  const { isMobile } = useContext(SidebarContext);

  return (
    <aside
      className={cn(
        "bg-light border-r-border sticky top-0 left-0 flex h-full w-full max-w-70 flex-col border-r xl:fixed xl:top-0 xl:left-0 xl:z-20 xl:h-screen",
        className,
      )}
      {...rest}
    >
      {isMobile && <SidebarCloseButton />}

      {header ? (
        <div className={cn("hidden py-5 xl:block", headerClassName)}>
          {header}
        </div>
      ) : null}

      <nav className={cn("flex flex-1 flex-col overflow-y-auto", navClassName)}>
        {children}
      </nav>

      {footer ? (
        <div className={cn("px-4 pt-3", footerClassName)}>{footer}</div>
      ) : null}
    </aside>
  );
}

// sidebar menu item type
export type SidebarMenuItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  key?: string;
  tKey?: string;
  iconClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
  activeClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
};

type SidebarMenuProps = {
  items: SidebarMenuItem[];
  listClassName?: string;
  itemClassName?: string;
  linkClassName?: string;
  iconClassName?: string;
  labelClassName?: string;
  activeClassName?: string;
};

/**
 * Renders a list of navigation menu items
 * Use this inside SidebarLayout's children
 */
export function SidebarMenu({
  items,
  listClassName,
  itemClassName,
  linkClassName = "text-text-dark hover:bg-background/50 flex items-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
  iconClassName = "mr-1.5 size-5",
  labelClassName,
  activeClassName = "bg-background",
}: SidebarMenuProps) {
  return (
    <ul className={cn("space-y-1", listClassName)}>
      {items.map((item) => {
        const ItemIcon = item.icon;
        const resolvedLabelClass = item.labelClassName ?? labelClassName;
        const labelContent = item.label ?? item.name;

        return (
          <li key={item.key ?? item.name} className={itemClassName}>
            <NavLink
              href={item.href}
              className={linkClassName}
              activeClassName={item.activeClassName ?? activeClassName}
              onClick={item.onClick}
            >
              <ItemIcon className={item.iconClassName ?? iconClassName} />
              {resolvedLabelClass ? (
                <span className={resolvedLabelClass}>{labelContent}</span>
              ) : (
                labelContent
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
// sidebar user menu props
interface SidebarUserMenuProps {
  orgs?: TOrg[];
}

/**
 * User menu with settings and account options
 * Use this in the sidebar footer to show user profile and settings
 */
export function SidebarUserMenu({ orgs = [] }: SidebarUserMenuProps) {
  return (
    <div className="flex flex-col gap-2">
      <SidebarProfileSetting />
      <SidebarUpgrade />
    </div>
  );
}

/** Internal: translated close button for the mobile sheet */
function SidebarCloseButton() {
  const tSidebar = useTranslations("navigation.sidebar");
  return (
    <SheetClose asChild>
      <button
        type="button"
        className="hover:bg-background border-border relative flex w-full items-center justify-center border-b py-4 transition-colors xl:hidden"
      >
        <ChevronLeft className="absolute left-4 size-5" />
        <h2 className="text-sm font-semibold">{tSidebar("actions.close")}</h2>
      </button>
    </SheetClose>
  );
}
