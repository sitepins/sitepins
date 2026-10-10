"use client";

import McpTokenFields, {
  defaultAgentSettings,
  grantScopes,
  isAgentSettingsComplete,
} from "@/components/mcp-token-fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { openUnlockPrompt } from "@/hooks/use-unlock-prompt";
import { buildAgentSetupPrompt } from "@/lib/agent-setup-prompt";
import { API_URL } from "@/lib/constant";
import {
  useCreateAgentTokenMutation,
  useGetAgentGrantsQuery,
  useRevokeAgentGrantMutation,
} from "@/redux/features/agent/agent-api";
import {
  EAgentWriteMode,
  TAgentGrant,
  TAgentGrantSettings,
} from "@/redux/features/agent/type";
import { getErrorMessage } from "@/redux/features/api-slice";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { McpConnectionSkeleton } from "./mcp-connection-skeleton";

const EXPIRY_DAYS = [7, 30, 90];

const mcpUrl = () => {
  try {
    return `${new URL(API_URL ?? "").origin}/mcp`;
  } catch {
    return "/mcp";
  }
};

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

function CopyField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  const t = useTranslations("agents.settings");
  const { copied, copy } = useCopy();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          onClick={() => copy(value)}
          aria-label={copied ? t("copied") : t("copy")}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </Field>
  );
}

function ConnectDialog({
  open,
  token,
  onClose,
}: {
  open: boolean;
  token: string;
  onClose: () => void;
}) {
  const t = useTranslations("agents.settings");
  const { copied, copy } = useCopy();
  const url = mcpUrl();
  const prompt = buildAgentSetupPrompt({ url, token });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("connect_title")}</DialogTitle>
          <DialogDescription>{t("connect_description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            readOnly
            value={prompt}
            aria-label={t("copy_prompt")}
            className="h-56 resize-none font-mono text-xs"
          />
          <Button className="w-full" onClick={() => copy(prompt)}>
            {copied ? <Check /> : <Copy />}
            {copied ? t("copied") : t("copy_prompt")}
          </Button>
          <details className="group border-border rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {t("manual_title")}
            </summary>
            <FieldGroup className="mt-4 gap-4">
              <CopyField
                id="agent-mcp-url"
                label={t("mcp_label")}
                value={url}
              />
              <CopyField
                id="agent-token"
                label={t("token_label")}
                value={token}
              />
              <p className="text-muted-foreground text-sm">
                {t("header_hint", { example: "Authorization: Bearer <token>" })}
              </p>
            </FieldGroup>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: string) => void;
}) {
  const t = useTranslations("agents.settings");
  const [settings, setSettings] = useState<TAgentGrantSettings>(() =>
    defaultAgentSettings(),
  );
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [createToken, { isLoading }] = useCreateAgentTokenMutation();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await createToken({
        ...settings,
        scopes: grantScopes(settings),
        name: name.trim(),
        expires_in_days: days,
      }).unwrap();
      setName("");
      setSettings(defaultAgentSettings());
      onCreated(result.token);
    } catch (error) {
      if ((error as { status?: number })?.status === 402) {
        openUnlockPrompt("mcp");
        return;
      }
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("create_title")}</DialogTitle>
          <DialogDescription>{t("create_description")}</DialogDescription>
        </DialogHeader>
        <form id="agent-token-form" onSubmit={onSubmit}>
          <FieldGroup className="gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="agent-token-name">
                  {t("token_name")}
                </FieldLabel>
                <Input
                  id="agent-token-name"
                  value={name}
                  maxLength={80}
                  placeholder={t("token_name_placeholder")}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-token-expiry">
                  {t("token_expiry")}
                </FieldLabel>
                <Select
                  value={String(days)}
                  onValueChange={(v) => setDays(Number(v))}
                >
                  <SelectTrigger id="agent-token-expiry" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {EXPIRY_DAYS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {t("days", { count: d })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <McpTokenFields
              value={settings}
              onChange={setSettings}
              disabled={isLoading}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="agent-token-form"
            isLoading={isLoading}
            disabled={
              isLoading || !name.trim() || !isAgentSettingsComplete(settings)
            }
          >
            {t("create_token")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenRow({ grant }: { grant: TAgentGrant }) {
  const t = useTranslations("agents.settings");
  const format = useFormatter();
  const [revoke, { isLoading }] = useRevokeAgentGrantMutation();
  const date = (value?: string) =>
    value ? format.dateTime(new Date(value), { dateStyle: "medium" }) : "";

  const onRevoke = async () => {
    try {
      await revoke(grant.grant_id).unwrap();
      toast.success(t("revoked"));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="hover:bg-muted/50 flex flex-col gap-4 px-4 py-4 transition-colors md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="bg-muted text-muted-foreground border-border flex size-10 shrink-0 items-center justify-center rounded-full border">
          <KeyRound className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-foreground truncate text-sm font-semibold">
              {grant.name}
            </p>
            {grant.write_mode === EAgentWriteMode.PULL_REQUEST && (
              <Badge variant="default" size="sm">
                {t("write_pr_badge")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {[
              grant.org_name,
              grant.all_projects
                ? t("all_sites")
                : (grant.projects ?? [])
                    .map((p) => p.name ?? p.project_id)
                    .join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-muted-foreground text-xs">
            {grant.last_used_at
              ? t("last_used", { date: date(grant.last_used_at) })
              : t("never_used")}
            {grant.expires_at &&
              ` · ${t("expires", { date: date(grant.expires_at) })}`}
            {` · ${grant.token_hint}…`}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full md:w-auto"
            disabled={isLoading}
          >
            {t("revoke")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("revoke_title", { name: grant.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("revoke_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onRevoke}>
              {t("revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function McpConnection() {
  const t = useTranslations("agents.settings");
  const { data: grants, isLoading, error } = useGetAgentGrantsQuery();
  const [creating, setCreating] = useState(false);
  // The token stays in state after closing so the dialog doesn't empty mid-animation.
  const [connect, setConnect] = useState({ open: false, token: "" });

  if (isLoading) {
    return <McpConnectionSkeleton />;
  }

  const list = grants ?? [];
  const createButton = (className?: string) => (
    <Button className={className} onClick={() => setCreating(true)}>
      <Plus />
      {t("create_token")}
    </Button>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {getErrorMessage(error)}
            </p>
          ) : list.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <KeyRound className="mx-auto mb-3 size-12 opacity-20" />
              <p className="text-sm">{t("empty")}</p>
            </div>
          ) : (
            <div className="divide-border border-border divide-y rounded-xl border">
              {list.map((grant) => (
                <TokenRow key={grant.grant_id} grant={grant} />
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>{createButton("w-full sm:w-auto")}</CardFooter>
      </Card>

      <CreateTokenDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(token) => {
          setCreating(false);
          setConnect({ open: true, token });
        }}
      />
      <ConnectDialog
        open={connect.open}
        token={connect.token}
        onClose={() => setConnect((c) => ({ ...c, open: false }))}
      />
    </>
  );
}
