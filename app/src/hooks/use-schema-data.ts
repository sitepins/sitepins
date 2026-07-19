"use client";

import { useGitProvider } from "@/hooks/use-git-provider";
import { SCHEMA_FOLDER } from "@/lib/constant";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { generateSchemaName } from "@/lib/utils/schema-generator";
import { selectConfig } from "@/redux/features/config/slice";
import { githubContentApi } from "@/redux/features/github";
import { gitlabContentApi } from "@/redux/features/gitlab";
import { useAppDispatch } from "@/redux/store";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

const inheritedSchemaCache = new Map<string, any>();

export function useSchemaData(relativePath: string, schemaDir?: string) {
  const dispatch = useAppDispatch();
  const config = useSelector(selectConfig);
  const { useGitContent } = useGitProvider();

  const { data: directSchema, error: directSchemaError } = useGitContent(
    schemaDir || "",
    {
      skip: !schemaDir,
      parser: true,
    },
  );

  const [inheritedSchema, setInheritedSchema] = useState<
    Record<string, any> | undefined
  >(undefined);

  const primarySchemaData =
    !directSchemaError && directSchema?.data ? directSchema.data : undefined;

  useEffect(() => {
    let cancelled = false;
    if (primarySchemaData) return;
    if (!directSchemaError && schemaDir) return;
    // Skip schema fetching entirely when schemaDir is not provided
    // This prevents schema lookup for non-content routes (media, code, configs)
    if (!schemaDir) return;

    (async () => {
      try {
        const folder = relativePath;
        if (!folder) return;
        let current = folder.replace(/\/+$/, "");

        const candidates: string[] = [];
        while (current && current.includes("/")) {
          current = current.substring(0, current.lastIndexOf("/"));
          const schemaName = generateSchemaName(current, config.content);
          candidates.push(`${SCHEMA_FOLDER}/${schemaName}.json`);
        }

        if (candidates.length === 0) return;

        for (const candidate of candidates) {
          const cacheKey = `${config.owner}|${config.repoName}|${config.branch}|${candidate}`;
          const cached = inheritedSchemaCache.get(cacheKey);
          if (cached && !cancelled) {
            setInheritedSchema(cached);
            return;
          }
        }

        const nearest = candidates[0];
        try {
          // @ts-ignore
          const res = isGitLabProvider(config.provider)
            ? await dispatch(
                gitlabContentApi.endpoints.getGitLabContent.initiate(
                  {
                    id: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    file_path: nearest,
                    ref: config.branch,
                    parser: true,
                  },
                  { forceRefetch: false },
                ),
              ).unwrap()
            : await dispatch(
                githubContentApi.endpoints.getGitHubContent.initiate(
                  {
                    owner: config.owner,
                    repo: config.repoName,
                    path: nearest,
                    ref: config.branch,
                    parser: true,
                  },
                  { forceRefetch: false },
                ),
              ).unwrap();

          if (res && !cancelled) {
            const key = `${config.owner}|${config.repoName}|${config.branch}|${nearest}`;
            inheritedSchemaCache.set(key, res);
            setInheritedSchema(res as Record<string, any>);
            return;
          }
        } catch (e) {
          // nearest not found
        }

        const remaining = candidates.slice(1);
        if (remaining.length === 0) return;

        const promises = remaining.map((candidate) =>
          (dispatch as any)(
            isGitLabProvider(config.provider)
              ? gitlabContentApi.endpoints.getGitLabContent.initiate(
                  {
                    id: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    file_path: candidate,
                    ref: config.branch,
                    parser: true,
                  },
                  { forceRefetch: false },
                )
              : githubContentApi.endpoints.getGitHubContent.initiate(
                  {
                    owner: config.owner,
                    repo: config.repoName,
                    path: candidate,
                    ref: config.branch,
                    parser: true,
                  },
                  { forceRefetch: false },
                ),
          )
            .unwrap()
            .then((res: any) => ({ candidate, res }))
            .catch(() => null),
        );

        const results = await Promise.all(promises);
        if (cancelled) return;

        for (const candidate of remaining) {
          const found = results.find(
            (r: any) => r && r.candidate === candidate && r.res,
          );
          if (found && !cancelled) {
            const key = `${config.owner}|${config.repoName}|${config.branch}|${candidate}`;
            inheritedSchemaCache.set(key, found.res);
            setInheritedSchema(found.res as Record<string, any>);
            break;
          }
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    directSchemaError,
    relativePath,
    config.owner,
    config.repoName,
    config.branch,
    config.content,
    primarySchemaData,
    dispatch,
    schemaDir,
    config.provider,
  ]);

  return primarySchemaData ?? inheritedSchema?.data;
}
