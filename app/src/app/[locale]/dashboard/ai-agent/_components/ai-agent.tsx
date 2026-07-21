"use client";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { aiProviders } from "@/lib/constant";
import { Eye, EyeOff, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// --- Types ---
type TAICredential = {
  apiKey: string;
  provider: string;
  model: string;
};

// --- Content Data ---
const SECURITY_NOTICE_KEYS = ["security1", "security2", "security3"];

// --- Components ---
export default function AISettings() {
  const tDashboardAiAgent = useTranslations("dashboard.ai_agent");
  const {
    aiCredential,
    showKey,
    handleSelect,
    handleChangeValue,
    toggleKeyVisibility,
    saveSettings,
    models,
    isDirty,
    initialAiCredential,
    deleteKey,
    autocomplete,
    toggleAutocomplete,
    isHydrated,
  } = useAISettings(tDashboardAiAgent);

  const [explicitCustom, setExplicitCustom] = useState(false);

  const isCustomMode = useMemo(() => {
    return (
      explicitCustom ||
      (aiCredential.model !== "" && !models.includes(aiCredential.model))
    );
  }, [explicitCustom, aiCredential.model, models]);

  const currentProviderDocsUrl = useMemo(() => {
    return aiProviders.find((p) => p.value === aiCredential.provider)?.docsUrl;
  }, [aiCredential.provider]);

  const providerOptions = useMemo(
    () =>
      aiProviders.map((p) => ({
        label: p.provider,
        value: p.value,
      })),
    [],
  );

  const modelOptions = useMemo(() => {
    const opts = models.map((m) => ({
      label: m,
      value: m,
    }));
    opts.push({
      label: tDashboardAiAgent("custom_model"),
      value: "custom",
    });
    return opts;
  }, [models, tDashboardAiAgent]);

  const handleProviderSelect = (val: string) => {
    setExplicitCustom(false);
    handleSelect("provider", val);
  };

  const handleModelSelect = (val: string) => {
    if (val === "custom") {
      setExplicitCustom(true);
      handleSelect("model", "");
    } else {
      setExplicitCustom(false);
      handleSelect("model", val);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{tDashboardAiAgent("title")}</CardTitle>
          <CardDescription>
            {tDashboardAiAgent("description")}
          </CardDescription>
        </CardHeader>
        <form onSubmit={saveSettings}>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <SelectionSelect
                label={tDashboardAiAgent("provider_label")}
                value={aiCredential.provider}
                options={providerOptions}
                onSelect={handleProviderSelect}
                placeholder={tDashboardAiAgent("provider_placeholder")}
                isLoading={!isHydrated}
              />

              <SelectionSelect
                label={tDashboardAiAgent("model_label")}
                value={isCustomMode ? "custom" : aiCredential.model}
                options={modelOptions}
                onSelect={handleModelSelect}
                disabled={!aiCredential.provider}
                placeholder={tDashboardAiAgent("model_placeholder")}
                isLoading={!isHydrated}
              />

              {isCustomMode && (
                <div className="animate-in fade-in slide-in-from-top-2 relative space-y-2.5 duration-300">
                  <div className="flex items-center gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="ai-custom-model"
                    >
                      {tDashboardAiAgent("custom_model_input_label")}
                    </label>
                    {currentProviderDocsUrl && (
                      <a
                        href={currentProviderDocsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary text-xs underline-offset-4 transition-colors hover:underline"
                      >
                        {tDashboardAiAgent("find_model_id")} ↗
                      </a>
                    )}
                  </div>
                  <Input
                    id="ai-custom-model"
                    name="model"
                    value={aiCredential.model}
                    onChange={handleChangeValue}
                    placeholder={tDashboardAiAgent(
                      "custom_model_input_placeholder",
                    )}
                  />
                </div>
              )}

              <div className="relative space-y-2.5">
                <label
                  className="inline-block text-sm font-medium"
                  htmlFor="ai-api-key"
                >
                  {tDashboardAiAgent("api_key_label")}
                </label>
                <div className="relative">
                  <Input
                    id="ai-api-key"
                    className="pr-10"
                    value={aiCredential.apiKey}
                    onChange={handleChangeValue}
                    placeholder={tDashboardAiAgent("api_key_placeholder")}
                    data-1p-ignore
                    type={showKey ? "text" : "password"}
                    name="apiKey"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-0.75 right-0.75 bottom-0.75 h-auto rounded-r-md"
                    onClick={toggleKeyVisibility}
                    type="button"
                  >
                    {showKey ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    <span className="sr-only">
                      {showKey
                        ? tDashboardAiAgent("hide")
                        : tDashboardAiAgent("show")}{" "}
                      {tDashboardAiAgent("api_key_label")}
                    </span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <label className="text-base font-medium">
                  {tDashboardAiAgent("copilot_title")}
                </label>
                <p className="text-muted-foreground text-xs">
                  {tDashboardAiAgent("copilot_description")}
                </p>
              </div>
              <Switch
                checked={autocomplete}
                onCheckedChange={toggleAutocomplete}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            {initialAiCredential.apiKey && (
              <Button
                variant="destructive"
                onClick={deleteKey}
                type="button"
                className="mr-auto"
              >
                <Trash className="mr-2 size-4" />
                {tDashboardAiAgent("delete_key")}
              </Button>
            )}
            <Button
              disabled={
                !aiCredential.provider ||
                !aiCredential.model ||
                (!aiCredential.apiKey && !initialAiCredential.apiKey) ||
                !isDirty
              }
              type="submit"
              className="ml-auto"
            >
              {tDashboardAiAgent("save_changes")}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="border-warning bg-warning/10 border">
        <CardContent className="space-y-2 p-4">
          <strong className="text-text-dark mb-4 block text-sm">
            {tDashboardAiAgent("security_title")}
          </strong>
          {SECURITY_NOTICE_KEYS.map((key, i) => (
            <p key={i} className="text-xs">
              •{" "}
              <span
                dangerouslySetInnerHTML={{
                  __html: tDashboardAiAgent(key).replace(
                    /\*\*(.*?)\*\*/g,
                    "<strong>$1</strong>",
                  ),
                }}
              />
            </p>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function SelectionSelect({
  label,
  value,
  options,
  onSelect,
  disabled = false,
  placeholder = "Select...",
  isLoading = false,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <label className="inline-block text-sm font-medium">{label}</label>
      {isLoading ? (
        <Skeleton className="h-9" />
      ) : (
        <Select value={value} onValueChange={onSelect} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// --- Hooks ---

function useAISettings(t: (key: string) => string) {
  const [aiCredential, setAiCredential] = useState<TAICredential>({
    provider: "",
    model: "",
    apiKey: "",
  });

  const [initialAiCredential, setInitialAiCredential] = useState<TAICredential>(
    { provider: "", model: "", apiKey: "" },
  );

  const [autocomplete, setAutocomplete] = useState<boolean>(false);
  const [initialAutocomplete, setInitialAutocomplete] =
    useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const loaded = {
      provider: localStorage.getItem("sitepins-ai-provider") || "",
      model: localStorage.getItem("sitepins-ai-model") || "",
      apiKey: localStorage.getItem("sitepins-ai-apiKey") || "",
    };
    const loadedAutocomplete =
      localStorage.getItem("sitepins-ai-autocomplete") === "true";

    setAiCredential(loaded);
    setInitialAiCredential(loaded);
    setAutocomplete(loadedAutocomplete);
    setInitialAutocomplete(loadedAutocomplete);
    setIsHydrated(true);
  }, []);

  const [showKey, setShowKey] = useState<boolean>(false);

  const isDirty = useMemo(() => {
    const credDirty =
      JSON.stringify(aiCredential) !== JSON.stringify(initialAiCredential);
    const autoDirty = autocomplete !== initialAutocomplete;
    return credDirty || autoDirty;
  }, [aiCredential, initialAiCredential, autocomplete, initialAutocomplete]);

  // Derived state for models based on selected provider
  const models = useMemo(() => {
    const selectedProvider = aiProviders.find(
      (p) => p.value === (aiCredential.provider || aiProviders[0].value),
    );
    return selectedProvider?.models || [];
  }, [aiCredential.provider]);

  // Handlers
  const saveSettings = (e: React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();

    try {
      if (aiCredential.provider) {
        localStorage.setItem("sitepins-ai-provider", aiCredential.provider);
      } else {
        localStorage.removeItem("sitepins-ai-provider");
      }

      if (aiCredential.model) {
        localStorage.setItem("sitepins-ai-model", aiCredential.model);
      } else {
        localStorage.removeItem("sitepins-ai-model");
      }

      if (aiCredential.apiKey) {
        localStorage.setItem("sitepins-ai-apiKey", aiCredential.apiKey);
      } else {
        localStorage.removeItem("sitepins-ai-apiKey");
      }

      localStorage.setItem("sitepins-ai-autocomplete", String(autocomplete));

      setInitialAiCredential(aiCredential);
      setInitialAutocomplete(autocomplete);
      toast.success(t("save_success"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  const toggleKeyVisibility = () => setShowKey((prev) => !prev);

  const handleChangeValue = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAiCredential((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelect = (name: string, value: string) => {
    setAiCredential((prev) => {
      if (name === "provider" && prev.provider !== value) {
        return { ...prev, provider: value, model: "" };
      }
      return { ...prev, [name]: value };
    });
  };

  const deleteKey = () => {
    setAiCredential({ provider: "", model: "", apiKey: "" });
  };

  const toggleAutocomplete = (checked: boolean) => {
    setAutocomplete(checked);
  };

  return {
    aiCredential,
    showKey,
    models,
    saveSettings,
    toggleKeyVisibility,
    handleChangeValue,
    handleSelect,
    deleteKey,
    isDirty,
    initialAiCredential,
    autocomplete,
    toggleAutocomplete,
    isHydrated,
  };
}
