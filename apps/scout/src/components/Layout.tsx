import { Outlet } from "react-router-dom";
import { ClientVersionGate } from "@/components/ClientVersionGate";
import { ClientToaster } from "@/components/ClientToaster";
import { UpdateNotification } from "@/components/UpdateNotification";

export function Layout() {
  return (
    <>
      <Outlet />
      <UpdateNotification />
      <ClientVersionGate />
      <ClientToaster />
    </>
  );
}
