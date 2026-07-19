import { RootState } from "@/redux/store";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type TFileMetaCacheEntry = {
  sha: string | null;
  commitDate?: string;
  createdDate?: string;
  size?: number;
};

type TGitMetaState = {
  files: Record<string, TFileMetaCacheEntry>;
};

const initialState: TGitMetaState = {
  files: {},
};

export const gitMetaSlice = createSlice({
  name: "gitMeta",
  initialState,
  reducers: {
    upsertFileMetadata(
      state,
      action: PayloadAction<Record<string, TFileMetaCacheEntry>>,
    ) {
      Object.assign(state.files, action.payload);
    },
    removeFileMetadata(state, action: PayloadAction<string[]>) {
      action.payload.forEach((key) => {
        delete state.files[key];
      });
    },
    resetGitMeta: () => initialState,
  },
});

export const { upsertFileMetadata, removeFileMetadata, resetGitMeta } =
  gitMetaSlice.actions;

export const selectFileMetadata = (state: RootState) => state.gitMeta.files;

export default gitMetaSlice.reducer;
