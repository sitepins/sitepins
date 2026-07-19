"use client";

import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth/auth-client";
import { deepEqualArray } from "@/lib/utils/comparison";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig, updateConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubTreesQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  useGetGitLabTreesQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { useAppDispatch } from "@/redux/store";
import { TArrangement } from "@/types";
import { Folder } from "lucide-react";
import { Reorder } from "motion/react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import { FileForm, FolderForm, HeadingForm } from "./arrange-site-forms";
import ArrangementItem from "./arrange-site-list";
import ArrangeSiteSkeleton from "./arrange-site-skeleton";

const formComponent = {
  folder: FolderForm,
  file: FileForm,
  heading: HeadingForm,
} as const;

export default function Arrangement({
  setIsModified,
}: {
  setIsModified: Dispatch<SetStateAction<boolean>>;
}) {
  const params = useParams();
  const { data: auth } = authClient.useSession();
  const dispatch = useAppDispatch();
  const tProjectSettingsArrangement = useTranslations(
    "project-settings.arrangement",
  );
  const tCommon = useTranslations("common");

  const config = useSelector(selectConfig);
  const { data: ghTreesData, isLoading: isGhTreesLoading } =
    useGetGitHubTreesQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        tree_sha: config.branch,
        recursive: "1",
        config: config,
      },
      {
        skip:
          !config.token ||
          !config.repoName ||
          !config.owner ||
          !config.branch ||
          !isGitHubProvider(config.provider),
      },
    );

  const { data: glTreesData, isLoading: isGlTreesLoading } =
    useGetGitLabTreesQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        ref: config.branch,
        recursive: true,
        config: config,
      },
      {
        skip:
          !config.token ||
          !config.repoName ||
          !config.branch ||
          !isGitLabProvider(config.provider),
      },
    );

  const treesData = isGitLabProvider(config.provider)
    ? glTreesData
    : ghTreesData;
  const isTreesLoading = isGitLabProvider(config.provider)
    ? isGlTreesLoading
    : isGhTreesLoading;

  const trees = treesData?.files || [];
  const [updateFile, { isLoading: isGhPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGitLabFiles, { isLoading: isGlPending }] =
    useUpdateGitLabFilesMutation();
  const [addLog] = useAddProjectLogMutation();

  const isPending = isGitLabProvider(config.provider)
    ? isGlPending
    : isGhPending;

  const memoArrangement = useMemo(() => {
    return config.arrangement.map((arrangement) => ({
      ...arrangement,
      id: crypto.randomUUID(),
    }));
  }, [config.arrangement]);

  const storeArrangement = useRef<TArrangement[]>(
    JSON.parse(JSON.stringify(memoArrangement)),
  );
  const [arrangements, setArrangement] =
    useState<TArrangement[]>(memoArrangement);
  const [isChanged, setIsChanged] = useState(false);
  const [type, setType] = useState<"folder" | "file" | "heading">();
  const Form = type ? formComponent[type] : null;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingArrangement, setEditingArrangement] = useState<
    TArrangement | undefined
  >(undefined);

  useEffect(() => {
    setArrangement(memoArrangement);
  }, [memoArrangement]);

  const handleArrangement = ({
    newArrangement,
  }: {
    newArrangement: TArrangement;
  }) => {
    const foundedIndex = arrangements.findIndex(
      (arrangement) => arrangement.id === newArrangement.id,
    );

    if (foundedIndex !== -1) {
      const newArrangements = [...arrangements];
      newArrangements[foundedIndex] = newArrangement;
      setArrangement(newArrangements);
    } else {
      setArrangement([...arrangements, newArrangement]);
    }
    setIsModified(true);
  };

  const handleDelete = (id: string) => {
    setArrangement(arrangements.filter((arrangement) => arrangement.id !== id));
  };

  const openModalForAdd = (t: "folder" | "file" | "heading") => {
    setEditingArrangement(undefined);
    setType(t);
    setModalOpen(true);
  };

  const openModalForEdit = (arr: TArrangement) => {
    setEditingArrangement(arr);
    setType(arr.type as any);
    setModalOpen(true);
  };

  useEffect(() => {
    setIsChanged(
      !deepEqualArray(storeArrangement.current, arrangements, ["id"]),
    );
  }, [arrangements]);

  const isConfigLoaded =
    config.token && config.repoName && config.branch && config.provider;

  if (!isConfigLoaded || isTreesLoading) return <ArrangeSiteSkeleton />;

  return (
    <>
      <CardContent className="p-4 pt-0 md:p-6">
        <Reorder.Group
          axis="y"
          className="relative"
          onReorder={setArrangement}
          values={arrangements}
        >
          {arrangements.length === 0 ? (
            <div className="flex h-62 flex-col items-center justify-center space-y-4 text-center">
              <div className="bg-muted/50 flex size-14 items-center justify-center rounded-2xl">
                <Folder className="size-7" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-semibold">
                  {tProjectSettingsArrangement("no_arrangements")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {tProjectSettingsArrangement("get_started")}
                </p>
              </div>

              <div>
                <Button
                  className="mt-4 inline-flex items-center rounded-md px-4 py-2"
                  onClick={() => openModalForAdd("folder")}
                >
                  {tProjectSettingsArrangement("add_item_btn")}
                </Button>
              </div>
            </div>
          ) : (
            arrangements.map((arrangement) => (
              <ArrangementItem
                key={arrangement.id}
                arrangement={arrangement}
                handleDelete={handleDelete}
                onEdit={() => openModalForEdit(arrangement)}
              />
            ))
          )}

          {arrangements.length > 0 && (
            <Button
              onClick={() => openModalForAdd("folder")}
              className="mt-4 w-full"
              variant={"outline"}
            >
              {tProjectSettingsArrangement("add_item_btn")}
            </Button>
          )}

          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="w-full gap-y-4 sm:max-w-106.25">
              <DialogHeader>
                <DialogTitle>
                  {editingArrangement
                    ? tProjectSettingsArrangement("edit_dialog_title")
                    : tProjectSettingsArrangement("add_dialog_title")}
                </DialogTitle>
                <DialogDescription>
                  {editingArrangement
                    ? tProjectSettingsArrangement("edit_dialog_desc")
                    : tProjectSettingsArrangement("add_dialog_desc")}
                </DialogDescription>
              </DialogHeader>

              <Field>
                <Label className="mb-2">
                  {tProjectSettingsArrangement("select_type_label")}
                </Label>
                <Select
                  value={type}
                  onValueChange={(value) => setType(value as any)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={tProjectSettingsArrangement(
                        "select_type_placeholder",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="folder">
                        {tProjectSettingsArrangement("type_options.folder")}
                      </SelectItem>
                      <SelectItem value="file">
                        {tProjectSettingsArrangement("type_options.file")}
                      </SelectItem>
                      <SelectItem value="heading">
                        {tProjectSettingsArrangement("type_options.heading")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              {type && Form && (
                <div className="w-full">
                  <Form
                    handleArrangement={handleArrangement}
                    trees={trees}
                    arrangements={arrangements}
                    arrangement={editingArrangement}
                    onClose={() => setModalOpen(false)}
                  />
                </div>
              )}
            </DialogContent>
          </Dialog>
        </Reorder.Group>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full sm:w-auto"
          isLoading={isPending}
          disabled={!isChanged}
          onClick={async () => {
            const updatedArrangements = arrangements.reduce<
              Omit<TArrangement, "id">[]
            >((acc, curr) => {
              const { id, ...rest } = curr;
              return [...acc, { ...rest }];
            }, []);

            const updatePromise = isGitLabProvider(config.provider)
              ? updateGitLabFiles({
                  id: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  branch: config.branch,
                  message: "Update arrangement",
                  files: [
                    {
                      path: ".sitepins/config.json",
                      content: JSON.stringify(
                        {
                          content: config.content,
                          media: config.media,
                          public: config.public,

                          configs: config.configs,
                          "custom-commit": config.customCommit ?? false,
                          arrangement: updatedArrangements,
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                })
              : updateFile({
                  files: [
                    {
                      path: ".sitepins/config.json",
                      content: JSON.stringify(
                        {
                          content: config.content,
                          media: config.media,
                          public: config.public,

                          configs: config.configs,
                          "custom-commit": config.customCommit ?? false,
                          arrangement: updatedArrangements,
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                  message: "Update arrangement",
                  owner: config.owner,
                  repo: config.repoName,
                  tree: config.branch,
                });

            updatePromise.then((res) => {
              if (!res.error?.message) {
                addLog({
                  project_id: params.projectId as string,
                  action: EAction.UPDATE,
                  file: ".sitepins/config.json",
                  file_type: EProjectLogType.CONFIG,
                  user_id: auth?.user.user_id!,
                });
                toast.success(tProjectSettingsArrangement("success_update"));
                dispatch(
                  updateConfig({ ...config, arrangement: arrangements }),
                );
                storeArrangement.current = JSON.parse(
                  JSON.stringify(arrangements),
                );
                setIsChanged(false);
              }
            });
          }}
        >
          {tCommon("actions.save")}
        </Button>
      </CardFooter>
    </>
  );
}
