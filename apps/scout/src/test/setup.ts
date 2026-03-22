import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// IndexedDB mock for Dexie
import "fake-indexeddb/auto";

afterEach(() => {
  cleanup();
});

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) =>
      react.createElement("a", { href: to, ...props }, children),
    RouterProvider: () => react.createElement(react.Fragment, null, "RouterProvider"),
    createBrowserRouter: (routes: unknown) => routes,
    Outlet: () => null,
  };
});

// Mock vite-plugin-pwa (virtual:pwa-register/react) for components that use useRegisterSW
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));
