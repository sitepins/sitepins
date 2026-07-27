import { MdxSnippet } from "@/editor/utils/plate-types";
import { migrateConfig } from "@/lib/utils/config-migration";
import { RootState } from "@/redux/store";
import { TConfig } from "@/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

const initialState: TConfig = {
  owner: "",
  currentLoginUserToken: "",
  repoName: "",
  refreshToken: "",
  accessTokenExpiresAt: 0,
  refreshTokenExpiresAt: 0,
  lastRefreshedAt: 0,
  token: "",
  provider: "",
  branch: "",
  isRawMode: false,
  content: "",
  framework: null,
  media: "",
  public: "",
  arrangement: [],
  configs: [],
  customCommit: false,
  snippets: [],
  fullscreen: false,
  cursorOffset: 0,
};

type ConfigPayload = Partial<TConfig> & {
  templates?: MdxSnippet[];
};

export const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    updateConfig: (state, action: PayloadAction<ConfigPayload>) => {
      const { templates, ...rest } = action.payload;

      const framework = (rest.framework || state.framework) as any;

      // Apply migration if needed
      const migratedConfig = migrateConfig(rest, framework);

      return {
        ...state,
        ...migratedConfig,
        ...(templates ? { snippets: templates } : {}),
      };
    },
    resetConfig: () => {
      return {
        ...initialState,
      };
    },
    setRawMode: (state, action: PayloadAction<boolean>) => {
      state.isRawMode = action.payload;
    },
    setCursorOffset: (state, action: PayloadAction<number>) => {
      state.cursorOffset = action.payload;
    },
  },
});

export const { updateConfig, setRawMode, resetConfig, setCursorOffset } =
  configSlice.actions;
export const selectConfig = (state: RootState) => state.config;

export default configSlice.reducer;
