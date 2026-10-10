"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  AGENT_SCOPES,
  EAgentScope,
  EAgentWriteMode,
  REQUIRED_AGENT_SCOPES,
  TAgentGrantSettings,
} from "@/redux/features/agent/type";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { useGetProjectsQuery } from "@/redux/features/project/project-api";
import {
  GitCommitHorizontal,
  GitPullRequest,
  Globe,
  ListChecks,
  LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ReactNode } from "react";

const scopeKey = (scope: EAgentScope) => scope.replace(":", "_");

export const defaultAgentSettings = (): TAgentGrantSettings => ({
  org_id: "",
  all_projects: false,
  project_ids: [],
  scopes: AGENT_SCOPES.filter((s) => s !== EAgentScope.CODE_WRITE),
  write_mode: EAgentWriteMode.DIRECT,
});

export const isAgentSettingsComplete = (settings: TAgentGrantSettings) =>
  Boolean(settings.org_id) &&
  (settings.all_projects || settings.project_ids.length > 0);

export const grantScopes = (settings: TAgentGrantSettings) => [
  ...new Set([...REQUIRED_AGENT_SCOPES, ...settings.scopes]),
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function CheckRow({
  id,
  checked,
  disabled,
  onChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "border-border flex items-start gap-3 rounded-lg border p-3 transition-colors contain-layout",
        checked && "border-primary/40 bg-primary/5",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(on) => onChange(Boolean(on))}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {description && (
          <span className="text-muted-foreground mt-0.5 block text-sm">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function OptionCard({
  id,
  value,
  selected,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  value: string;
  selected: boolean;
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "border-border has-focus-visible:ring-ring/50 flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-all contain-layout has-focus-visible:ring-2",
        selected
          ? "border-primary bg-primary/10 ring-primary ring-1"
          : "hover:border-primary/20",
      )}
    >
      <RadioGroupItem
        value={value}
        id={id}
        className="pointer-events-none absolute size-0 opacity-0"
      />
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-lg border",
          selected
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground border-border",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </span>
      </span>
    </label>
  );
}

const MODE_ICONS = {
  [EAgentWriteMode.DIRECT]: GitCommitHorizontal,
  [EAgentWriteMode.PULL_REQUEST]: GitPullRequest,
};

export default function McpTokenFields({
  value,
  onChange,
  disabled,
}: {
  value: TAgentGrantSettings;
  onChange: (next: TAgentGrantSettings) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("agents");
  const { data: orgs, isLoading: orgsLoading } = useGetOrgsQuery();
  const { data: projects, isFetching: projectsLoading } = useGetProjectsQuery(
    value.org_id,
    { skip: !value.org_id },
  );
  const activeOrgs = (orgs ?? []).filter((o) => o.status !== "archived");
  const orgProjects = projects ?? [];
  const allPicked =
    orgProjects.length > 0 &&
    orgProjects.every((p) => value.project_ids.includes(p.project_id));

  const toggle = <T,>(list: T[], item: T, on: boolean) =>
    on ? [...new Set([...list, item])] : list.filter((x) => x !== item);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="agent-org">{t("fields.organization")}</Label>
        {orgsLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select
            value={value.org_id}
            disabled={disabled}
            onValueChange={(org) =>
              onChange({ ...value, org_id: String(org ?? ""), project_ids: [] })
            }
          >
            <SelectTrigger id="agent-org" className="w-full">
              <SelectValue placeholder={t("fields.select_org")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {activeOrgs.map((org) => (
                  <SelectItem key={org.org_id} value={org.org_id}>
                    {org.org_name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      {value.org_id && (
        <Section title={t("fields.projects")}>
          <RadioGroup
            value={value.all_projects ? "all" : "selected"}
            disabled={disabled}
            onValueChange={(choice) =>
              onChange({ ...value, all_projects: choice === "all" })
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <OptionCard
              id="agent-projects-all"
              value="all"
              icon={Globe}
              selected={Boolean(value.all_projects)}
              title={t("fields.projects_all")}
              description={t("fields.projects_all_description")}
            />
            <OptionCard
              id="agent-projects-selected"
              value="selected"
              icon={ListChecks}
              selected={!value.all_projects}
              title={t("fields.projects_selected")}
              description={t("fields.projects_selected_description")}
            />
          </RadioGroup>

          {!value.all_projects &&
            (projectsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : orgProjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("fields.no_projects")}
              </p>
            ) : (
              <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                <label
                  htmlFor="agent-projects-toggle-all"
                  className="bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 contain-layout"
                >
                  <Checkbox
                    id="agent-projects-toggle-all"
                    checked={allPicked}
                    disabled={disabled}
                    onCheckedChange={(on) =>
                      onChange({
                        ...value,
                        project_ids: on
                          ? orgProjects.map((p) => p.project_id)
                          : [],
                      })
                    }
                  />
                  <span className="flex-1 text-sm font-medium">
                    {t("fields.select_all")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("fields.selected_count", {
                      count: value.project_ids.length,
                      total: orgProjects.length,
                    })}
                  </span>
                </label>
                <div className="divide-border max-h-56 divide-y overflow-y-auto">
                  {orgProjects.map((project) => (
                    <label
                      key={project.project_id}
                      htmlFor={`agent-project-${project.project_id}`}
                      className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-3 py-2.5 contain-layout"
                    >
                      <Checkbox
                        id={`agent-project-${project.project_id}`}
                        checked={value.project_ids.includes(project.project_id)}
                        disabled={disabled}
                        onCheckedChange={(on) =>
                          onChange({
                            ...value,
                            project_ids: toggle(
                              value.project_ids,
                              project.project_id,
                              Boolean(on),
                            ),
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {project.project_name}
                      </span>
                      <span className="text-muted-foreground max-w-[45%] truncate text-xs">
                        {project.repository}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </Section>
      )}

      <Section title={t("fields.permissions")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {AGENT_SCOPES.map((scope) => {
            const required = REQUIRED_AGENT_SCOPES.includes(scope);
            return (
              <CheckRow
                key={scope}
                id={`agent-scope-${scopeKey(scope)}`}
                checked={required || value.scopes.includes(scope)}
                disabled={disabled || required}
                onChange={(on) =>
                  onChange({
                    ...value,
                    scopes: toggle(value.scopes, scope, on),
                  })
                }
                title={t(`scopes.${scopeKey(scope)}.title`)}
                description={t(`scopes.${scopeKey(scope)}.description`)}
              />
            );
          })}
        </div>
      </Section>

      <Section title={t("fields.write_mode")}>
        <RadioGroup
          value={value.write_mode}
          disabled={disabled}
          onValueChange={(mode) =>
            onChange({ ...value, write_mode: mode as EAgentWriteMode })
          }
          className="grid gap-3 sm:grid-cols-2"
        >
          {[EAgentWriteMode.DIRECT, EAgentWriteMode.PULL_REQUEST].map(
            (mode) => (
              <OptionCard
                key={mode}
                id={`agent-mode-${mode}`}
                value={mode}
                selected={value.write_mode === mode}
                icon={MODE_ICONS[mode]}
                title={t(`fields.write_${mode}`)}
                description={t(`fields.write_${mode}_description`)}
              />
            ),
          )}
        </RadioGroup>
      </Section>
    </div>
  );
}
