import React from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { CompanyFormValues } from "@citadel/types";

export interface CompanyFormProps {
  register: UseFormRegister<CompanyFormValues>;
  errors: FieldErrors<CompanyFormValues>;
  disabled?: boolean;
  /** 入力欄の className */
  inputClassName?: string;
  /** ラベルに必須マークを付けるか */
  requiredMark?: boolean;
}

const defaultInputClassName =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

const errorBorderClassName = "border-red-500";

export function CompanyForm({
  register,
  errors,
  disabled = false,
  inputClassName = defaultInputClassName,
  requiredMark = true,
}: CompanyFormProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          会社名 {requiredMark && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          {...register("name")}
          disabled={disabled}
          className={`${inputClassName} ${errors.name ? errorBorderClassName : ""}`}
          placeholder="株式会社○○"
        />
        {errors.name?.message && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">部署</label>
        <input
          type="text"
          {...register("department")}
          disabled={disabled}
          className={`${inputClassName} ${errors.department ? errorBorderClassName : ""}`}
          placeholder="営業部"
        />
        {errors.department?.message && (
          <p className="mt-1 text-sm text-red-600">{errors.department.message}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
        <input
          type="text"
          {...register("postalCode")}
          disabled={disabled}
          className={`${inputClassName} ${errors.postalCode ? errorBorderClassName : ""}`}
          placeholder="〒123-4567"
        />
        {errors.postalCode?.message && (
          <p className="mt-1 text-sm text-red-600">{errors.postalCode.message}</p>
        )}
      </div>
      <div className="md:col-span-2 lg:col-span-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
        <input
          type="text"
          {...register("address")}
          disabled={disabled}
          className={`${inputClassName} ${errors.address ? errorBorderClassName : ""}`}
          placeholder="東京都○○区..."
        />
        {errors.address?.message && (
          <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
        <input
          type="text"
          {...register("phone")}
          disabled={disabled}
          className={`${inputClassName} ${errors.phone ? errorBorderClassName : ""}`}
          placeholder="03-1234-5678"
        />
        {errors.phone?.message && (
          <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">FAX</label>
        <input
          type="text"
          {...register("fax")}
          disabled={disabled}
          className={`${inputClassName} ${errors.fax ? errorBorderClassName : ""}`}
          placeholder="03-1234-5679"
        />
        {errors.fax?.message && <p className="mt-1 text-sm text-red-600">{errors.fax.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
        <input
          type="email"
          {...register("email")}
          disabled={disabled}
          className={`${inputClassName} ${errors.email ? errorBorderClassName : ""}`}
          placeholder="info@example.com"
        />
        {errors.email?.message && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>
    </div>
  );
}
