import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { LanguageType } from "../locales";
import { stateStorage } from "../utils/stateStorage";
import { ListType, SearchData } from "../utils/types";

interface GenericTempStates {
  filterMenu: boolean;
  searchData: SearchData;
  listType: ListType;
  showFilterMenu: (show: boolean) => void;
  setSearchData: (key: keyof SearchData, value: any) => void;
  setListType: (type: ListType) => void;
}

const useGenericTempState = create<GenericTempStates>()((set, get) => ({
  filterMenu: false,
  searchData: {
    query: "",
    nonEmpty: false,
    ompOnly: false,
    unpassworded: false,
    sortPing: "none",
    sortPlayer: "none",
    sortName: "none",
    sortMode: "none",
    sortLock: "none",
    languages: [],
  },
  listType: "favorites",
  showFilterMenu: (show) => set(() => ({ filterMenu: show })),
  setSearchData: (key, value) =>
    set(() => {
      const data = { ...get().searchData };
      // @ts-ignore
      data[key] = value;
      return { searchData: { ...data } };
    }),
  setListType: (type) => set(() => ({ listType: type })),
}));

// Server list Mode column width, set by dragging its right-hand divider.
// Name takes the remaining space; Players and Ping are sized to fit.
export const DEFAULT_MODE_WIDTH = 200;

interface GenericPersistentStates {
  sideLists: boolean;
  language: LanguageType;
  modeColumnWidth: number;
  showSideLists: (show: boolean) => void;
  setLanguage: (lang: LanguageType) => void;
  setModeColumnWidth: (width: number) => void;
}

const useGenericPersistentState = create<GenericPersistentStates>()(
  persist(
    (set) => ({
      sideLists: true,
      language: "en",
      modeColumnWidth: DEFAULT_MODE_WIDTH,
      showSideLists: (show: boolean) => set(() => ({ sideLists: show })),
      setLanguage: (lang) => set(() => ({ language: lang })),
      setModeColumnWidth: (width) => set(() => ({ modeColumnWidth: width })),
    }),
    {
      name: "generic-state-storage",
      storage: createJSONStorage(() => stateStorage),
    }
  )
);

export { useGenericPersistentState, useGenericTempState };
