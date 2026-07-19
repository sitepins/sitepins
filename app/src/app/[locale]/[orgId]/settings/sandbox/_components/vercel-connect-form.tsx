"use client";

import { UpgradeCta } from "@/components/upgrade-cta";
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils/cn";
import { useUpdateOrgMutation } from "@/redux/features/orgs/org-api";
import { TOrg } from "@/redux/features/orgs/type";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface SandboxConnectFormProps {
  org: TOrg;
  canUpdate: boolean;
  isHobby: boolean;
}

type Team = { id: string; name: string; slug: string };

type ConnectPhase = "token" | "team_select" | "connecting";

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
  isHobby,
}: SandboxConnectFormProps) {
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<ConnectPhase>("token");
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

  // Reset form state when toggling update form
  useEffect(() => {
    if (!showUpdateForm) {
      setToken("");
      setPhase("token");
      setPendingConnect(null);
      setSelectedTeamId("");
    }
  }, [showUpdateForm]);

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
        setPhase("team_select");
      } else {
        // Personal only — proceed immediately
        await handleFinalize(tokenValue.trim(), username, "");
      }
    } catch (err: any) {
      toast(tOrgSandbox("toast_connect_error"), { description: err?.message });
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
    setPhase("connecting");
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
      setPhase("token");
      toast(tOrgSandbox("toast_connect_success"), {
        description: tOrgSandbox("toast_connect_success_desc", { username }),
      });
    } catch (err: any) {
      toast(tOrgSandbox("toast_connect_error"), { description: err?.message });
      setPhase(pendingConnect ? "team_select" : "token");
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

  // ── Token input form ──────────────────────────────────────────────────────

  const tokenForm = (
    <div className="space-y-4">
      <ol className="text-muted-foreground space-y-2 text-sm">
        <li>
          1.{" "}
          <a
            href="https://vercel.com/account/tokens"
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

      <div className="space-y-2">
        <Label htmlFor="sandbox-token">{tOrgSandbox("token_label")}</Label>
        <Input
          id="sandbox-token"
          type="password"
          placeholder={tOrgSandbox("token_placeholder")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && !isValidating && handleValidate(token)
          }
          disabled={isValidating}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => handleValidate(token)}
          disabled={isValidating || token.trim().length < 20}
        >
          {isValidating && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isValidating
            ? tOrgSandbox("status_validating")
            : isConnected
              ? tOrgSandbox("save_token_btn")
              : tOrgSandbox("connect_btn")}
        </Button>
        {isConnected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUpdateForm(false)}
          >
            {tOrgSandbox("cancel_btn")}
          </Button>
        )}
      </div>
    </div>
  );

  // ── Team picker ───────────────────────────────────────────────────────────

  const teamPicker = pendingConnect && (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{tOrgSandbox("select_team_title")}</Label>
        <RadioGroup
          value={selectedTeamId}
          onValueChange={setSelectedTeamId}
          className="space-y-1.5"
        >
          {/* Personal account */}
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              selectedTeamId === ""
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <RadioGroupItem value="" id="team-personal" />
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
                selectedTeamId === team.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <RadioGroupItem value={team.id} id={`team-${team.id}`} />
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

      <div className="flex items-center gap-3">
        <Button
          onClick={() =>
            handleFinalize(
              pendingConnect.token,
              pendingConnect.username,
              selectedTeamId,
            )
          }
          disabled={isConnecting}
        >
          {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isConnecting
            ? connectStatus || tOrgSandbox("connecting")
            : tOrgSandbox("connect_btn")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isConnecting}
          onClick={() => {
            setPhase("token");
            setPendingConnect(null);
          }}
        >
          {tOrgSandbox("change_token")}
        </Button>
      </div>
    </div>
  );

  // ── Security notice card ─────────────────────────────────────────────────

  const securityCard = (
    <Card className="border-warning bg-warning/10 border">
      <CardContent className="space-y-2 p-4">
        <strong className="text-text-dark mb-4 block text-sm">
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

  // ── Hobby gate ────────────────────────────────────────────────────────────

  if (isHobby) {
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>{tOrgSandbox("title")}</CardTitle>
                <CardDescription className="mt-1">
                  {tOrgSandbox("description")}
                </CardDescription>
              </div>
              <UpgradeCta labelKey="sandbox" />
            </div>
          </CardHeader>
        </Card>
        {securityCard}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{tOrgSandbox("title")}</CardTitle>
          <CardDescription>{tOrgSandbox("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isConnected ? (
            <div className="space-y-4">
              {/* Connected status */}
              <div className="border-border flex items-start gap-3 rounded-lg border p-4">
                <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" />
                <div className="flex-1 space-y-1">
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

              {/* Actions */}
              {canUpdate && !showUpdateForm && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUpdateForm(true)}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    {tOrgSandbox("update_token_btn")}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                      >
                        <Unlink className="mr-2 size-4" />
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
                          <Button
                            variant="destructive"
                            onClick={handleDisconnect}
                          >
                            {tOrgSandbox("disconnect_confirm_btn")}
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {/* Update token flow */}
              {canUpdate &&
                showUpdateForm &&
                (phase === "team_select" ? teamPicker : tokenForm)}
            </div>
          ) : (
            <div className="space-y-4">
              {!canUpdate ? (
                <p className="text-muted-foreground text-sm">
                  {tOrgSandbox("no_permission")}
                </p>
              ) : phase === "team_select" ? (
                teamPicker
              ) : (
                tokenForm
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {securityCard}
    </>
  );
}
