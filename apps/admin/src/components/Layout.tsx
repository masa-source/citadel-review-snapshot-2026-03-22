import { Outlet } from "react-router-dom";
import { ClientToaster } from "@/components/ClientToaster";

export function Layout() {
  return (
    <>
      <Outlet />
      <ClientToaster />
    </>
  );
}
