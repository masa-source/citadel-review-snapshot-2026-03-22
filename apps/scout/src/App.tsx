import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { MasterEntityPage } from "@/routes/MasterEntityPage";

import Home from "@/routes/Home";
import ManagePage from "@/routes/ManagePage";
import MastersPage from "@/routes/MastersPage";
import ReportsPage from "@/routes/reports/ReportsPage";
import ReportEditPage from "@/routes/reports/ReportEditPage";
import OfflinePage from "@/routes/OfflinePage";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "manage", element: <ManagePage /> },
      { path: "masters", element: <MastersPage /> },
      { path: "masters/:entity", element: <MasterEntityPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "reports/edit", element: <ReportEditPage /> },
      { path: "offline", element: <OfflinePage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
