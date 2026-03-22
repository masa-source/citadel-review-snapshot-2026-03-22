/**
 * マスタフォーム用の共通型（データソースに依存しない）。
 */

export interface CompanyFormData {
  name: string;
  department: string;
  postalCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
}

export const emptyCompanyFormData: CompanyFormData = {
  name: "",
  department: "",
  postalCode: "",
  address: "",
  phone: "",
  fax: "",
  email: "",
};
