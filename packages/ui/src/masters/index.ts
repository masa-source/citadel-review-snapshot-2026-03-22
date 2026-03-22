export { CompanyForm } from "./CompanyForm";
export type { CompanyFormProps } from "./CompanyForm";

export { MasterCrud } from "./MasterCrud";
export type { MasterCrudFormSlotProps, MasterCrudProps } from "./MasterCrud";
export type { MasterCrudAdapter } from "./MasterCrudAdapter";
export { MasterFormActions } from "./MasterFormActions";
export type { MasterFormActionsProps } from "./MasterFormActions";
export { MasterTable } from "./MasterTable";
export type { MasterTableColumn, MasterTableProps } from "./MasterTable";
export { emptyCompanyFormData, type CompanyFormData } from "./types";

// ジェネリック UIコンポーネント と メタデータ のエクスポートを追加
export { GenericDynamicForm } from "./GenericDynamicForm";
export type { GenericDynamicFormProps, GetRefOptions } from "./GenericDynamicForm";

export { GenericMasterFormSlot } from "./GenericMasterFormSlot";
export type { GenericMasterFormSlotProps } from "./GenericMasterFormSlot";

export { MASTER_METADATA, getMasterSchema } from "./metadata";
export type { MasterMetadata, MasterMetadataKey } from "./metadata";
