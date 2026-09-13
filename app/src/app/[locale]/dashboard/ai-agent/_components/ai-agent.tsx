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
import { toast } from "@/components/ui/toast";
import { useHydrated } from "@/hooks/use-hydrated";
import { aiProviders } from "@/lib/constant";
import { ArrowUpRight, Eye, EyeOff, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChangeEvent, useMemo, useState } from "react";

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
    editorAi,
    toggleEditorAi,
    codeAi,
    toggleCodeAi,
    commitAi,
    toggleCommitAi,
    seoAi,
    toggleSeoAi,
    searchAi,
    toggleSearchAi,
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

  const handleDeleteKey = () => {
    setExplicitCustom(false);
    deleteKey();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{tDashboardAiAgent("title")}</CardTitle>
          <CardDescription>{tDashboardAiAgent("description")}</CardDescription>
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
                        className="text-muted-foreground hover:text-primary group inline-flex items-center gap-1 text-xs transition-colors"
                      >
                        <span className="underline-offset-4 hover:underline">
                          {tDashboardAiAgent("find_model_id")}
                        </span>
                        <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
                    className="pe-10"
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
                    className="absolute inset-e-0.75 top-0.75 bottom-0.75 h-auto rounded-e-md"
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

            <div className="space-y-3">
              <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5 pe-4">
                  <label className="text-base font-medium">
                    {tDashboardAiAgent("search_ai_title")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {tDashboardAiAgent("search_ai_description")}
                  </p>
                </div>
                <Switch checked={searchAi} onCheckedChange={toggleSearchAi} />
              </div>

              <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5 pe-4">
                  <label className="text-base font-medium">
                    {tDashboardAiAgent("editor_ai_title")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {tDashboardAiAgent("editor_ai_description")}
                  </p>
                </div>
                <Switch checked={editorAi} onCheckedChange={toggleEditorAi} />
              </div>

              <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5 pe-4">
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

              <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5 pe-4">
                  <label className="text-base font-medium">
                    {tDashboardAiAgent("seo_ai_title")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {tDashboardAiAgent("seo_ai_description")}
                  </p>
                </div>
                <Switch checked={seoAi} onCheckedChange={toggleSeoAi} />
              </div>

              <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5 pe-4">
                  <label className="text-base font-medium">
                    {tDashboardAiAgent("code_ai_title")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {tDashboardAiAgent("code_ai_description")}
                  </p>
                </div>
                <Switch checked={codeAi} onCheckedChange={toggleCodeAi} />
              </div>

              <div className="border-border bg-background flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5 pe-4">
                  <label className="text-base font-medium">
                    {tDashboardAiAgent("commit_ai_title")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {tDashboardAiAgent("commit_ai_description")}
                  </p>
                </div>
                <Switch checked={commitAi} onCheckedChange={toggleCommitAi} />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            {initialAiCredential.apiKey && (
              <Button
                variant="destructive"
                onClick={handleDeleteKey}
                type="button"
              >
                <Trash className="me-2 size-4" />
                {tDashboardAiAgent("delete_key")}
              </Button>
            )}
            <Button
              disabled={
                !aiCredential.provider ||
                !aiCredential.model ||
                !aiCredential.apiKey.trim() ||
                !isDirty
              }
              type="submit"
              className="ms-auto"
            >
              {tDashboardAiAgent("save_changes")}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="border-warning bg-warning/10 border">
        <CardContent className="space-y-2 p-4">
          <strong className="text-text-strong mb-4 block text-sm">
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

  const [autocomplete, setAutocomplete] = useState<boolean>(true);
  const [initialAutocomplete, setInitialAutocomplete] = useState<boolean>(true);

  const [editorAi, setEditorAi] = useState<boolean>(true);
  const [initialEditorAi, setInitialEditorAi] = useState<boolean>(true);

  const [codeAi, setCodeAi] = useState<boolean>(true);
  const [initialCodeAi, setInitialCodeAi] = useState<boolean>(true);

  const [commitAi, setCommitAi] = useState<boolean>(true);
  const [initialCommitAi, setInitialCommitAi] = useState<boolean>(true);

  const [seoAi, setSeoAi] = useState<boolean>(true);
  const [initialSeoAi, setInitialSeoAi] = useState<boolean>(true);

  const [searchAi, setSearchAi] = useState<boolean>(true);
  const [initialSearchAi, setInitialSearchAi] = useState<boolean>(true);

  const isHydrated = useHydrated();

  // localStorage is unreadable on the server, so the form seeds itself on the
  // first client render rather than after a mount effect.
  const [isSeeded, setIsSeeded] = useState(false);
  if (isHydrated && !isSeeded) {
    setIsSeeded(true);
    const loadedProvider = localStorage.getItem("sitepins-ai-provider") || "";
    let loadedModel = localStorage.getItem("sitepins-ai-model") || "";
    if (loadedProvider === "groq") {
      if (loadedModel === "qwen3.8-27b") loadedModel = "qwen/qwen3.8-27b";
      else if (loadedModel === "qwen3.6-27b") loadedModel = "qwen/qwen3.6-27b";
      else if (
        loadedModel === "qwen3-32b" ||
        loadedModel === "gemma2-9b-it" ||
        loadedModel === "llama-3.3-70b-versatile" ||
        loadedModel === "llama-3.1-8b-instant"
      ) {
        loadedModel = "openai/gpt-oss-120b";
      }
      if (loadedModel !== localStorage.getItem("sitepins-ai-model")) {
        localStorage.setItem("sitepins-ai-model", loadedModel);
      }
    }
    const loaded = {
      provider: loadedProvider,
      model: loadedModel,
      apiKey: localStorage.getItem("sitepins-ai-apiKey") || "",
    };
    const loadedAutocomplete =
      localStorage.getItem("sitepins-ai-autocomplete") !== "false";
    const loadedEditorAi =
      localStorage.getItem("sitepins-ai-editor") !== "false";
    const loadedCodeAi = localStorage.getItem("sitepins-ai-code") !== "false";
    const loadedCommitAi =
      localStorage.getItem("sitepins-ai-commit") !== "false";
    const loadedSeoAi = localStorage.getItem("sitepins-ai-seo") !== "false";
    const loadedSearchAi =
      localStorage.getItem("sitepins-ai-search") !== "false";

    setAiCredential(loaded);
    setInitialAiCredential(loaded);
    setAutocomplete(loadedAutocomplete);
    setInitialAutocomplete(loadedAutocomplete);
    setEditorAi(loadedEditorAi);
    setInitialEditorAi(loadedEditorAi);
    setCodeAi(loadedCodeAi);
    setInitialCodeAi(loadedCodeAi);
    setCommitAi(loadedCommitAi);
    setInitialCommitAi(loadedCommitAi);
    setSeoAi(loadedSeoAi);
    setInitialSeoAi(loadedSeoAi);
    setSearchAi(loadedSearchAi);
    setInitialSearchAi(loadedSearchAi);
  }

  const [showKey, setShowKey] = useState<boolean>(false);

  const isDirty = useMemo(() => {
    const credDirty =
      JSON.stringify(aiCredential) !== JSON.stringify(initialAiCredential);
    const autoDirty = autocomplete !== initialAutocomplete;
    const editorAiDirty = editorAi !== initialEditorAi;
    const codeAiDirty = codeAi !== initialCodeAi;
    const commitAiDirty = commitAi !== initialCommitAi;
    const seoAiDirty = seoAi !== initialSeoAi;
    const searchAiDirty = searchAi !== initialSearchAi;
    return (
      credDirty ||
      autoDirty ||
      editorAiDirty ||
      codeAiDirty ||
      commitAiDirty ||
      seoAiDirty ||
      searchAiDirty
    );
  }, [
    aiCredential,
    initialAiCredential,
    autocomplete,
    initialAutocomplete,
    editorAi,
    initialEditorAi,
    codeAi,
    initialCodeAi,
    commitAi,
    initialCommitAi,
    seoAi,
    initialSeoAi,
    searchAi,
    initialSearchAi,
  ]);

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
      const trimmedKey = aiCredential.apiKey.trim();
      if (trimmedKey) {
        localStorage.setItem("sitepins-ai-apiKey", trimmedKey);
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
      } else {
        localStorage.removeItem("sitepins-ai-apiKey");
        localStorage.removeItem("sitepins-ai-provider");
        localStorage.removeItem("sitepins-ai-model");
      }

      localStorage.setItem("sitepins-ai-autocomplete", String(autocomplete));
      localStorage.setItem("sitepins-ai-editor", String(editorAi));
      localStorage.setItem("sitepins-ai-code", String(codeAi));
      localStorage.setItem("sitepins-ai-commit", String(commitAi));
      localStorage.setItem("sitepins-ai-seo", String(seoAi));
      localStorage.setItem("sitepins-ai-search", String(searchAi));

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));

      const savedAiCredential = trimmedKey
        ? { ...aiCredential, apiKey: trimmedKey }
        : { provider: "", model: "", apiKey: "" };

      setAiCredential(savedAiCredential);
      setInitialAiCredential(savedAiCredential);
      setInitialAutocomplete(autocomplete);
      setInitialEditorAi(editorAi);
      setInitialCodeAi(codeAi);
      setInitialCommitAi(commitAi);
      setInitialSeoAi(seoAi);
      setInitialSearchAi(searchAi);
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
    try {
      localStorage.removeItem("sitepins-ai-apiKey");
      localStorage.removeItem("sitepins-ai-provider");
      localStorage.removeItem("sitepins-ai-model");

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));

      const reset = { provider: "", model: "", apiKey: "" };
      setAiCredential(reset);
      setInitialAiCredential(reset);
      setShowKey(false);
      toast.success(t("delete_key_success"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  const toggleAutocomplete = (checked: boolean) => {
    setAutocomplete(checked);
    try {
      localStorage.setItem("sitepins-ai-autocomplete", String(checked));
      setInitialAutocomplete(checked);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));
      toast.success(
        checked
          ? t("copilot_enabled") || "Autocomplete enabled"
          : t("copilot_disabled") || "Autocomplete disabled",
      );
    } catch {
      // Storage unavailable
    }
  };

  const toggleEditorAi = (checked: boolean) => {
    setEditorAi(checked);
    try {
      localStorage.setItem("sitepins-ai-editor", String(checked));
      setInitialEditorAi(checked);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));
      toast.success(
        checked
          ? t("editor_ai_enabled") || "Editor AI enabled"
          : t("editor_ai_disabled") || "Editor AI disabled",
      );
    } catch {
      // Storage unavailable
    }
  };

  const toggleCodeAi = (checked: boolean) => {
    setCodeAi(checked);
    try {
      localStorage.setItem("sitepins-ai-code", String(checked));
      setInitialCodeAi(checked);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));
      toast.success(
        checked
          ? t("code_ai_enabled") || "Code editor AI enabled"
          : t("code_ai_disabled") || "Code editor AI disabled",
      );
    } catch {
      // Storage unavailable
    }
  };

  const toggleCommitAi = (checked: boolean) => {
    setCommitAi(checked);
    try {
      localStorage.setItem("sitepins-ai-commit", String(checked));
      setInitialCommitAi(checked);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));
      toast.success(
        checked
          ? t("commit_ai_enabled") || "Git commit generator enabled"
          : t("commit_ai_disabled") || "Git commit generator disabled",
      );
    } catch {
      // Storage unavailable
    }
  };

  const toggleSeoAi = (checked: boolean) => {
    setSeoAi(checked);
    try {
      localStorage.setItem("sitepins-ai-seo", String(checked));
      setInitialSeoAi(checked);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));
      toast.success(
        checked
          ? t("seo_ai_enabled") || "SEO & metadata assistant enabled"
          : t("seo_ai_disabled") || "SEO & metadata assistant disabled",
      );
    } catch {
      // Storage unavailable
    }
  };

  const toggleSearchAi = (checked: boolean) => {
    setSearchAi(checked);
    try {
      localStorage.setItem("sitepins-ai-search", String(checked));
      setInitialSearchAi(checked);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("sitepins:ai-settings-changed"));
      toast.success(
        checked
          ? t("search_ai_enabled") || "Search AI Copilot enabled"
          : t("search_ai_disabled") || "Search AI Copilot disabled",
      );
    } catch {
      // Storage unavailable
    }
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
    editorAi,
    toggleEditorAi,
    codeAi,
    toggleCodeAi,
    commitAi,
    toggleCommitAi,
    seoAi,
    toggleSeoAi,
    searchAi,
    toggleSearchAi,
    isHydrated,
  };
}
