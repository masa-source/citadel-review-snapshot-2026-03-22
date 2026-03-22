import { create } from "zustand";

export interface NetworkErrorState {
  /** 直近のネットワークエラー（Sentry には送らず、UI フォールバック用） */
  lastNetworkError: Error | null;
  setNetworkError: (error: Error | null) => void;
  clearNetworkError: () => void;
}

export const useNetworkErrorStore = create<NetworkErrorState>((set) => ({
  lastNetworkError: null,
  setNetworkError: (error) => set({ lastNetworkError: error }),
  clearNetworkError: () => set({ lastNetworkError: null }),
}));
