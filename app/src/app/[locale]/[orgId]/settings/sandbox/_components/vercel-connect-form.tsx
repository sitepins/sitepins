"use client";

import { errorMessage } from "@/lib/utils/error";
import { UnlockCta } from "@/components/unlock-cta";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils/cn";
import { useUpdateOrgMutation } from "@/redux/features/orgs/org-api";
import { TOrg } from "@/redux/features/orgs/type";
import { CheckCircle2, ExternalLink, RefreshCw, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import _Link from "next/link";
import { useState } from "react";
import { toast } from "@/components/ui/toast";

type SandboxConnectFormProps = {
  org: TOrg;
  canUpdate: boolean;
  isRestricted: boolean;
};

type Team = { id: string; name: string; slug: string };

const TOKEN_FORM_ID = "sandbox-token-form";

const SANDBOX_NOTICE_KEYS = [
  "security0",
  "security1",
  "security2",
  "security3",
  "security4",
  "security5",
] as const;

export default function VercelConnectForm({
  org,
  canUpdate,
  isRestricted,
}: SandboxConnectFormProps) {
  const [token, setToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState("");
  const [pendingConnect, setPendingConnect] = useState<{
    token: string;
    username: string;
    teams: Team[];
  } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  const [updateOrg] = useUpdateOrgMutation();
  const tOrgSandbox = useTranslations("org.sandbox");

  const vi = org.sandbox;
  const isConnected = !!vi?.token && !!vi?.project_id;

  // Closing the update form discards its draft.
  const [formWasOpen, setFormWasOpen] = useState(showUpdateForm);
  if (formWasOpen !== showUpdateForm) {
    setFormWasOpen(showUpdateForm);
    if (!showUpdateForm) {
      setToken("");
      setPendingConnect(null);
      setSelectedTeamId("");
    }
  }

  // Step 1: validate token + fetch teams
  const handleValidate = async (tokenValue: string) => {
    if (tokenValue.trim().length < 20) {
      toast(tOrgSandbox("toast_token_required"));
      return;
    }

    setIsValidating(true);
    try {
      const res = await fetch("/api/vercel-integration/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");

      const { username, teams = [] } = data as {
        username: string;
        teams: Team[];
      };

      if (teams.length > 0) {
        // Pause — let user pick account
        setPendingConnect({ token: tokenValue.trim(), username, teams });
        setSelectedTeamId(""); // default: personal
      } else {
        // Personal only — proceed immediately
        await handleFinalize(tokenValue.trim(), username, "");
      }
    } catch (err) {
      toast(tOrgSandbox("toast_connect_error"), {
        description: errorMessage(err),
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Step 2: create project + save org
  const handleFinalize = async (
    tokenValue: string,
    username: string,
    teamId: string,
  ) => {
    setIsConnecting(true);
    try {
      setConnectStatus(tOrgSandbox("status_creating_project"));
      const orgSlug = org.org_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      const projectName = `${orgSlug}-preview-sandbox`;

      const createRes = await fetch("/api/vercel-integration/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenValue, teamId, projectName }),
      });
      const createData = await createRes.json();
      if (!createRes.ok)
        throw new Error(createData.error ?? "Failed to create sandbox project");

      setConnectStatus(tOrgSandbox("status_saving"));
      await updateOrg({
        org_id: org.org_id,
        sandbox: {
          token: tokenValue,
          team_id: teamId,
          project_id: createData.id,
          project_name: createData.name,
          username,
        },
      }).unwrap();

      setToken("");
      setShowUpdateForm(false);
      setPendingConnect(null);
      toast(tOrgSandbox("toast_connect_success"), {
        description: tOrgSandbox("toast_connect_success_desc", { username }),
      });
    } catch (err) {
      toast(tOrgSandbox("toast_connect_error"), {
        description: errorMessage(err),
      });
    } finally {
      setIsConnecting(false);
      setConnectStatus("");
    }
  };

  const handleDisconnect = async () => {
    try {
      await updateOrg({ org_id: org.org_id, sandbox: null }).unwrap();
      toast(tOrgSandbox("toast_disconnect_success"));
    } catch {
      toast(tOrgSandbox("toast_disconnect_error"));
    }
  };

  const isBusy = isValidating || isConnecting;

  // ── Token input form ──────────────────────────────────────────────────────

  const tokenForm = (
    <form
      id={TOKEN_FORM_ID}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isBusy) handleValidate(token);
      }}
    >
      <ol className="text-muted-foreground space-y-2 text-sm">
        <li>
          1.{" "}
          <a
            href="https://vercel.com/account/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 underline"
          >
            {tOrgSandbox("create_token_link")}
            <ExternalLink className="size-3" />
          </a>
        </li>
        <li>2. {tOrgSandbox("step2")}</li>
        <li>3. {tOrgSandbox("step3")}</li>
      </ol>

      <Field>
        <FieldLabel htmlFor="sandbox-token">
          {tOrgSandbox("token_label")}
        </FieldLabel>
        <Input
          id="sandbox-token"
          type="password"
          placeholder={tOrgSandbox("token_placeholder")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={isBusy}
        />
      </Field>
    </form>
  );

  // ── Team picker ───────────────────────────────────────────────────────────

  const teamPicker = pendingConnect && (
    <div className="space-y-2">
      <Label>{tOrgSandbox("select_team_title")}</Label>
      <RadioGroup
        value={selectedTeamId}
        onValueChange={setSelectedTeamId}
        disabled={isConnecting}
        className="space-y-1.5"
      >
        {/* Personal account */}
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
            isConnecting && "cursor-not-allowed opacity-60",
            selectedTeamId === ""
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50",
          )}
        >
          <RadioGroupItem value="" id="team-personal" disabled={isConnecting} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {tOrgSandbox("personal_account")}
            </p>
            <p className="text-muted-foreground font-mono text-xs">
              @{pendingConnect.username}
            </p>
          </div>
        </label>

        {/* Teams */}
        {pendingConnect.teams.map((team) => (
          <label
            key={team.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              isConnecting && "cursor-not-allowed opacity-60",
              selectedTeamId === team.id
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <RadioGroupItem
              value={team.id}
              id={`team-${team.id}`}
              disabled={isConnecting}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{team.name}</p>
              <p className="text-muted-foreground font-mono text-xs">
                @{team.slug}
              </p>
            </div>
          </label>
        ))}
      </RadioGroup>
    </div>
  );

  // ── Connected status ──────────────────────────────────────────────────────

  const connectedStatus = (
    <div className="border-border flex items-center gap-3 rounded-lg border p-4">
      <div className="bg-success/10 text-success flex size-10 shrink-0 items-center justify-center rounded-lg">
        <CheckCircle2 className="size-5" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{tOrgSandbox("connected")}</p>
        {vi?.username && (
          <p className="text-muted-foreground text-sm">
            {tOrgSandbox("account")}:{" "}
            <span className="font-mono">{vi.username}</span>
          </p>
        )}
        {vi?.team_id && (
          <p className="text-muted-foreground text-sm">
            {tOrgSandbox("team_label")}:{" "}
            <span className="font-mono text-xs">{vi.team_id}</span>
          </p>
        )}
        {(vi?.project_name ?? vi?.project_id) && (
          <p className="text-muted-foreground text-sm">
            {tOrgSandbox("project_label")}:{" "}
            {vi?.username && vi?.project_name ? (
              <a
                href={`https://vercel.com/${vi.username}/${vi.project_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 font-mono text-xs underline"
              >
                {vi.project_name}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <span className="font-mono text-xs">
                {vi?.project_name ?? vi?.project_id}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );

  // ── Footer actions ────────────────────────────────────────────────────────

  const connectedActions = (
    <>
      <Button
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => setShowUpdateForm(true)}
      >
        <RefreshCw className="me-2 size-4" />
        {tOrgSandbox("update_token_btn")}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full sm:w-auto">
            <Unlink className="me-2 size-4" />
            {tOrgSandbox("disconnect_btn")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tOrgSandbox("disconnect_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tOrgSandbox("disconnect_confirm_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {tOrgSandbox("disconnect_cancel_btn")}
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={handleDisconnect}>
                {tOrgSandbox("disconnect_confirm_btn")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  const formActions = pendingConnect ? (
    <>
      <Button
        variant="outline"
        className="w-full sm:w-auto"
        disabled={isConnecting}
        onClick={() => setPendingConnect(null)}
      >
        {tOrgSandbox("change_token")}
      </Button>
      <Button
        className="w-full sm:w-auto"
        isLoading={isConnecting}
        onClick={() =>
          handleFinalize(
            pendingConnect.token,
            pendingConnect.username,
            selectedTeamId,
          )
        }
      >
        {isConnecting
          ? connectStatus || tOrgSandbox("connecting")
          : tOrgSandbox("connect_btn")}
      </Button>
    </>
  ) : (
    <>
      {isConnected && (
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isBusy}
          onClick={() => setShowUpdateForm(false)}
        >
          {tOrgSandbox("cancel_btn")}
        </Button>
      )}
      <Button
        className="w-full sm:w-auto"
        form={TOKEN_FORM_ID}
        type="submit"
        disabled={token.trim().length < 20}
        isLoading={isBusy}
      >
        {isValidating
          ? tOrgSandbox("status_validating")
          : isConnecting
            ? connectStatus || tOrgSandbox("connecting")
            : isConnected
              ? tOrgSandbox("save_token_btn")
              : tOrgSandbox("connect_btn")}
      </Button>
    </>
  );

  // ── Security notice card ─────────────────────────────────────────────────

  const securityCard = (
    <Card className="border-warning bg-warning/10 border">
      <CardContent className="space-y-2 p-4">
        <strong className="text-text-strong mb-4 block text-sm">
          {tOrgSandbox("security_title")}
        </strong>
        {SANDBOX_NOTICE_KEYS.map((key) => (
          <p key={key} className="text-xs">
            •{" "}
            <span
              dangerouslySetInnerHTML={{
                __html: tOrgSandbox(key).replace(
                  /\*\*(.*?)\*\*/g,
                  "<strong>$1</strong>",
                ),
              }}
            />
          </p>
        ))}
      </CardContent>
    </Card>
  );

  // ── Restricted gate ───────────────────────────────────────────────────────

  if (isRestricted) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>{tOrgSandbox("title")}</CardTitle>
            <CardDescription>{tOrgSandbox("description")}</CardDescription>
            <CardAction>
              <UnlockCta labelKey="sandbox" />
            </CardAction>
          </CardHeader>
        </Card>
        {securityCard}
      </>
    );
  }

  const showForm = canUpdate && (!isConnected || showUpdateForm);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{tOrgSandbox("title")}</CardTitle>
          <CardDescription>{tOrgSandbox("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && connectedStatus}
          {!isConnected && !canUpdate && (
            <p className="text-muted-foreground text-sm">
              {tOrgSandbox("no_permission")}
            </p>
          )}
          {showForm && (pendingConnect ? teamPicker : tokenForm)}
        </CardContent>
        {canUpdate && (
          <CardFooter className="gap-x-3">
            {showForm ? formActions : connectedActions}
          </CardFooter>
        )}
      </Card>
      {securityCard}
    </>
  );
}
