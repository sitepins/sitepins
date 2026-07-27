"use client";

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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { authClient, Session } from "@/lib/auth/auth-client";
import { IS_DEMO } from "@/lib/constant";
import { useDeleteUserMutation } from "@/redux/features/user/user-api";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function DeleteAccount({ auth }: { auth: Session }) {
  const tDashboardAccountDelete = useTranslations("dashboard.account.delete");
  const tCommon = useTranslations("common");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const { user } = auth;
  const [deleteUser, { isSuccess, error, isLoading }] = useDeleteUserMutation();
  const router = useRouter();

  const deleteReasonOptions = [
    { value: "complex", label: tDashboardAccountDelete("reasons.complex") },
    { value: "not_work", label: tDashboardAccountDelete("reasons.not_work") },
    {
      value: "poor_design",
      label: tDashboardAccountDelete("reasons.poor_design"),
    },
    { value: "bugs", label: tDashboardAccountDelete("reasons.bugs") },
    {
      value: "missing_features",
      label: tDashboardAccountDelete("reasons.missing_features"),
    },
    {
      value: "better_alternative",
      label: tDashboardAccountDelete("reasons.better_alternative"),
    },
    { value: "other", label: tDashboardAccountDelete("reasons.other") },
  ];

  // Other text is optional; a reason selection is required
  const isReasonValid = selectedReason !== null;

  const handleProcessDelete = async () => {
    if (IS_DEMO) {
      toast.error(tDashboardAccountDelete("feedback.demo_disabled"));
      return;
    }
    try {
      // prepare reason field
      const reason =
        selectedReason === "other"
          ? otherReason || tDashboardAccountDelete("reasons.other")
          : deleteReasonOptions.find((r) => r.value === selectedReason)
              ?.label || "Not specified";

      await deleteUser({ payload: { reason }, user_id: user.user_id }).unwrap();

      if (!isSuccess && error) throw error;

      toast.success(tDashboardAccountDelete("feedback.success"));

      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.refresh();
          },
        },
      });
    } catch (error: any) {
      toast.error(error?.message || tDashboardAccountDelete("feedback.error"));
    }
  };

  return (
    <>
      <Card
        id="delete-account"
        className="ring-destructive/20 dark:ring-destructive/40"
      >
        <CardHeader>
          <CardTitle>{tDashboardAccountDelete("title")}</CardTitle>
          <CardDescription className="text-destructive">
            {tDashboardAccountDelete("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="delete_confirm" className="mb-3">
            {tDashboardAccountDelete.rich("confirm_label", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </Label>
          <Input
            id="delete_confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={tDashboardAccountDelete("confirm_placeholder")}
          />
        </CardContent>
        <CardFooter className="bg-destructive/10">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={deleteConfirmText !== "DELETE"}
                className="w-full sm:w-auto"
              >
                {tDashboardAccountDelete("button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {tDashboardAccountDelete("reason_title")}
                </AlertDialogTitle>
              </AlertDialogHeader>
              <div className="pt-2">
                <fieldset className="space-y-2">
                  <RadioGroup
                    value={selectedReason}
                    onValueChange={setSelectedReason}
                    defaultValue=""
                  >
                    {deleteReasonOptions.map((option) => {
                      const checked = selectedReason === option.value;
                      return (
                        <div
                          key={option.value}
                          onClick={() => setSelectedReason(option.value)}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors select-none ${
                            checked
                              ? "border-primary bg-primary/5"
                              : "hover:border-muted border-transparent"
                          }`}
                        >
                          <RadioGroupItem
                            checked={checked}
                            value={option.value}
                            id={option.value}
                          />
                          <Label
                            className="mb-0 w-full cursor-pointer"
                            htmlFor={option.value}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                setSelectedReason(option.value);
                              }
                            }}
                            tabIndex={0}
                          >
                            {option.label}
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </fieldset>

                {selectedReason === "other" && (
                  <div className="pt-3">
                    <Label htmlFor="otherReason">
                      {tDashboardAccountDelete("other_reason_label")}
                    </Label>
                    <Textarea
                      id="otherReason"
                      value={otherReason}
                      onChange={(e) =>
                        setOtherReason(e.target.value.slice(0, 200))
                      }
                      placeholder={tDashboardAccountDelete(
                        "other_reason_placeholder",
                      )}
                      className="mt-2 w-full"
                    />
                    <div className="text-muted-foreground mt-1 text-sm">
                      {otherReason.length}/200
                    </div>
                  </div>
                )}
              </div>

              <AlertDialogDescription>
                {tDashboardAccountDelete("description")}
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {tCommon("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    disabled={isLoading || !isReasonValid}
                    isLoading={isLoading}
                    variant="destructive"
                    onClick={handleProcessDelete}
                  >
                    {tDashboardAccountDelete("button")}
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </>
  );
}
