export { cn } from "./utils";
export { Button, buttonVariants } from "./primitives/button";
export { Alert, AlertTitle, AlertDescription } from "./primitives/alert";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./primitives/dialog";
export { Toaster } from "./primitives/sonner";
export { toast } from "sonner";
export {
  CompanyForm,
  type CompanyFormProps,
  MasterCrud,
  type MasterCrudFormSlotProps,
  type MasterCrudProps,
  type MasterCrudAdapter,
  MasterFormActions,
  type MasterFormActionsProps,
  MasterTable,
  type MasterTableColumn,
  type MasterTableProps,
  emptyCompanyFormData,
  type CompanyFormData,

  // Generic components & metadata
  GenericDynamicForm,
  type GenericDynamicFormProps,
  type GetRefOptions,
  GenericMasterFormSlot,
  type GenericMasterFormSlotProps,
  MASTER_METADATA,
  getMasterSchema,
  type MasterMetadata,
  type MasterMetadataKey,
} from "./masters";

export { ConfirmDialog, type ConfirmDialogProps } from "./components/ConfirmDialog";
export {
  useConfirmDialog,
  type UseConfirmDialogResult,
  type ConfirmOptions,
} from "./hooks/useConfirmDialog";
export { notify } from "./notify";
export type { ErrorContext } from "@citadel/monitoring";
