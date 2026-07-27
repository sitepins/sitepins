import { RootState } from "@/redux/store";
import { TFiles } from "@/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface MediaState {
  media: TFiles[];
  recentUpload: TFiles[];
  sortby: string;
  view: "grid" | "list";
  popupBreadcrumbs: TFiles[];
}

const initialState: MediaState = {
  media: [],
  recentUpload: [],
  sortby: "title-asc",
  view: "grid",
  popupBreadcrumbs: [],
};

export const mediaSlice = createSlice({
  name: "media",
  initialState,
  reducers: {
    setMedia: (state, action: PayloadAction<TFiles[]>) => {
      state.media = action.payload;
    },
    setSortBy: (state, action: PayloadAction<string>) => {
      state.sortby = action.payload;
      if (state.sortby === "title-asc") {
        state.media = [...state.media].sort((a, b) => {
          return a.name.localeCompare(b.name);
        });
      } else if (state.sortby === "title-desc") {
        state.media = [...state.media].sort((a, b) => {
          return b.name.localeCompare(a.name);
        });
      }
    },

    excludeMedia: (state, action: PayloadAction<string>) => {
      state.media = state.media.filter((file) => file.path !== action.payload);
    },

    addNewMedia: (state, action: PayloadAction<TFiles[]>) => {
      state.media = [...action.payload, ...state.media];
    },

    setView: (state, action: PayloadAction<"grid" | "list">) => {
      state.view = action.payload;
    },

    setPopupBreadcrumbs: (state, action: PayloadAction<TFiles[]>) => {
      state.popupBreadcrumbs = action.payload;
    },
  },
});

export const {
  setMedia,
  excludeMedia,
  addNewMedia,
  setSortBy,
  setView,
  setPopupBreadcrumbs,
} = mediaSlice.actions;
export const selectMediaInfo = (state: RootState) => state.media;

export default mediaSlice;
mediaSlice.reducer;
