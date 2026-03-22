import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { MasterEntityPage } from "@/routes/MasterEntityPage";

import Dashboard from "@/routes/Dashboard";
import MastersPage from "@/routes/MastersPage";
import ExportPage from "@/routes/ExportPage";
import TemplatesPage from "@/routes/templates/TemplatesPage";
import DemoDataPage from "@/routes/DemoDataPage";
import DraftingPage from "@/routes/templates/DraftingPage";
import SchemaDefinitionBuilderPage from "@/routes/masters/SchemaDefinitionBuilderPage";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "masters", element: <MastersPage /> },
      { path: "masters/:entity", element: <MasterEntityPage /> },
      {
        path: "masters/schema-definitions/:id/builder",
        element: <SchemaDefinitionBuilderPage />,
      },
      { path: "export", element: <ExportPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "templates/drafting/:id", element: <DraftingPage /> },
      { path: "demo-data", element: <DemoDataPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
