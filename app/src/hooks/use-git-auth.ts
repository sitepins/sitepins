import { authClient } from "@/lib/auth/auth-client";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { useGetProvidersQuery } from "@/redux/features/provider/provider-api";
import { TProvider } from "@/redux/features/provider/type";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseGitAuthProps {
  ignore?: boolean;
  onSuccess?: (providers: TProvider) => void;
  selectedProvider?: TProvider["provider"];
}

export function useGitAuth({
  ignore = false,
  selectedProvider: selectedProviderProp,
  onSuccess = () => {},
}: UseGitAuthProps = {}): {
  isTokenChanged: boolean;
  providersLoading: boolean;
  selectedProvider: TProvider | undefined;
  isProvidersSuccess: boolean;
  providers: TProvider[];
  handleClick: (overrideProvider?: TProvider["provider"]) => void;
} {
  const { data: auth } = authClient.useSession();
  const ref = useRef<NodeJS.Timeout | null>(null);
  const [isTokenChanged, setTokenChanged] = useState(false);
  const [isClicked, setClicked] = useState(false);
  const prevProvider = useRef<TProvider[] | null>(null);
  const provider = selectedProviderProp || "Github";

  const {
    data: providers,
    isLoading: providersLoading,
    isSuccess: isProvidersSuccess,
    refetch: refreshProvider,
  } = useGetProvidersQuery(auth?.user.user_id, {
    refetchOnMountOrArgChange: true,
    skip: !auth?.user.user_id || ignore,
  });

  useEffect(() => {
    if (isProvidersSuccess && providers) {
      if (!prevProvider.current) {
        prevProvider.current = providers;
      }

      const currentSelectedProvider = prevProvider.current?.find(
        (item) => item.provider === provider,
      );
      const selectedProvider = providers.find(
        (item) => item.provider === provider,
      );

      const tokenChanged =
        currentSelectedProvider?.accessToken !== selectedProvider?.accessToken;

      if (tokenChanged) {
        setTokenChanged(true);
        prevProvider.current = providers;
        setClicked(false);
        if (isClicked) {
          onSuccess(selectedProvider!);
        }
      }
    }
  }, [isProvidersSuccess, providers, provider, isClicked, onSuccess]);

  useEffect(() => {
    if (isClicked && !providersLoading) {
      ref.current = setInterval(() => {
        refreshProvider();
      }, 1000);
    }

    return () => {
      clearInterval(ref.current!);
    };
  }, [isClicked, providersLoading, refreshProvider]);

  const handleClick = useCallback(
    (overrideProvider?: TProvider["provider"]) => {
      setClicked(true);
      const width = 800;
      const height = 700;
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;
      const left = (screenWidth - width) / 2;
      const top = (screenHeight - height) / 2;

      const activeProvider = overrideProvider || provider;

      const url = isGitLabProvider(activeProvider)
        ? `https://gitlab.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/gitlab-installed")}&response_type=code&scope=api+read_user`
        : `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}/installations/select_target`;

      window.open(
        url,
        "_blank",
        `width=${width},height=${height},left=${left},top=${top}`,
      );
    },
    [provider],
  );

  return {
    isTokenChanged,
    selectedProvider: prevProvider.current?.find(
      (item) => item.provider === provider,
    ),
    providersLoading: providersLoading || isClicked,
    isProvidersSuccess,
    providers: providers || [],
    handleClick,
  };
}
