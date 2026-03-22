import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import React from "react";

afterEach(() => {
  cleanup();
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useSearchParams: () => new URLSearchParams(),
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
    Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) =>
      React.createElement("a", { href: to, ...rest }, children),
  };
});
