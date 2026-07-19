import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { api } from "./features/api-slice";
import gitMetaReducer from "./features/config/meta-slice";
import { configSlice } from "./features/config/slice";
import { githubApi } from "./features/github/github-api";
import { gitlabApi } from "./features/gitlab/gitlab-api";
import mediaSlice from "./features/media/slice";
import { packageSlice } from "./features/plan/slice";

export const store = configureStore({
  reducer: {
    [configSlice.name]: configSlice.reducer,
    [mediaSlice.name]: mediaSlice.reducer,
    [api.reducerPath]: api.reducer,
    [packageSlice.name]: packageSlice.reducer,
    [githubApi.reducerPath]: githubApi.reducer,
    [gitlabApi.reducerPath]: gitlabApi.reducer,
    gitMeta: gitMetaReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    }).concat(githubApi.middleware, gitlabApi.middleware, api.middleware),
  devTools: process.env.NODE_ENV !== "production",
});

setupListeners(store.dispatch);
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export type RootState = ReturnType<typeof store.getState>;
export const useTypedSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppSelector = <TSelected = unknown>(
  selector: (state: RootState) => TSelected,
): TSelected => useSelector<RootState, TSelected>(selector);
