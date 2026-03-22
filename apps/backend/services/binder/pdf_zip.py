"""
PDF 結合・ZIP 出力: 複数テンプレートの xlwings 処理、Microsoft Print to PDF、pypdf、zipfile。
"""

from __future__ import annotations

import gc
import logging
import os
import sys
import time
import zipfile
from pathlib import Path

import psutil
import xlwings as xw
from pypdf import PdfWriter

from .context import ReportContextLike, TemplateLike
from .excel_placeholders import _fill_sheet_placeholders

if sys.platform == "win32":
    import winreg  # noqa: E402

from utils.paths import get_output_temp_dir

logger = logging.getLogger(__name__)


def _get_excel_printer_name(printer_name: str = "Microsoft Print to PDF") -> str | None:
    """
    Windows レジストリから指定プリンタのエントリを取得し、
    Excel の ActivePrinter に設定するための正確な名前（例: "Microsoft Print to PDF on Ne01:"）を返す。
    sys.platform != "win32" の場合は None を返す。
    """
    if sys.platform != "win32":
        return None
    key_path = r"Software\Microsoft\Windows NT\CurrentVersion\Devices"
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            key_path,
            0,
            winreg.KEY_READ,
        ) as key:
            i = 0
            while True:
                try:
                    value_name, value_data, _ = winreg.EnumValue(key, i)
                except OSError:
                    break
                if value_name.strip() == printer_name.strip():
                    parts = value_data.split(",", 1)
                    port = parts[1].strip() if len(parts) > 1 else ""
                    if port:
                        return f"{value_name} on {port}"
                    return value_name
                i += 1
    except OSError as e:
        logger.warning("レジストリからプリンタ名を取得できませんでした: %s", e)
    return None


def generate_report_pdf(
    templates: list[TemplateLike],
    output_pdf_path: str | Path,
    context: ReportContextLike,
    assets_base: str | Path,
    *,
    keep_excel: bool = False,
    use_printer: bool = False,
) -> Path:
    """
    複数テンプレート Excel にコンテキストを流し込み、それぞれ PDF 化した後、
    pypdf で 1 つの PDF に結合して出力する。
    """
    assets_base = Path(assets_base).resolve()
    output_pdf_path = Path(output_pdf_path).resolve()
    output_pdf_path.parent.mkdir(parents=True, exist_ok=True)

    sorted_templates = sorted(
        [t for t in templates if t.file_path],
        key=lambda t: (
            t.sort_order if t.sort_order is not None else 999,
            t.file_path or "",
        ),
    )
    if not sorted_templates:
        raise ValueError("有効なテンプレートがありません。")

    base_temp = get_output_temp_dir()
    base_temp.mkdir(parents=True, exist_ok=True)
    run_dir = base_temp / f"run_{int(time.time() * 1000)}_{os.getpid()}"
    run_dir.mkdir(parents=True, exist_ok=True)
    tmpdir_path = run_dir
    pdf_paths: list[Path] = []

    if output_pdf_path.exists():
        output_pdf_path.unlink()

    for i, t in enumerate(sorted_templates):
        app = None
        pid = None
        try:
            app = xw.App(visible=False)
            pid = app.pid
            app.display_alerts = False
            app.screen_updating = False
            template_path = (assets_base / (t.file_path or "")).resolve()
            if not template_path.exists():
                raise FileNotFoundError(
                    f"テンプレートが見つかりません: {template_path}"
                )
            template_path_str = os.path.normpath(os.path.abspath(str(template_path)))
            logger.info("Opening template (pid=%s): %s", pid, template_path_str)
            book = app.books.open(template_path_str)
            try:
                for sheet in book.sheets:
                    _fill_sheet_placeholders(sheet, context)
                temp_xlsx = (tmpdir_path / f"temp_{i:03d}.xlsx").resolve()
                if temp_xlsx.exists():
                    temp_xlsx.unlink()
                book.save(str(temp_xlsx))
                part_pdf = (tmpdir_path / f"part_{i:03d}.pdf").resolve()
                if part_pdf.exists():
                    part_pdf.unlink()
                pdf_abs_path = str(part_pdf.resolve()).replace("/", "\\")
                last_err = None
                use_print_to_pdf = (
                    use_printer
                    and sys.platform == "win32"
                    and _get_excel_printer_name("Microsoft Print to PDF") is not None
                )
                saved_printer: str | None = None
                if use_print_to_pdf:
                    excel_printer = _get_excel_printer_name("Microsoft Print to PDF")
                    try:
                        saved_printer = app.api.ActivePrinter
                        app.api.ActivePrinter = excel_printer
                        for attempt in range(3):
                            try:
                                logger.info(
                                    "Printing to PDF (Microsoft Print to PDF): %s (Attempt %d/3)",
                                    pdf_abs_path,
                                    attempt + 1,
                                )
                                book.api.PrintOut(
                                    PrintToFile=True,
                                    PrToFileName=pdf_abs_path,
                                )
                                last_err = None
                                break
                            except Exception as pdf_err:
                                last_err = pdf_err
                                if attempt < 2:
                                    logger.warning(
                                        "PDF出力リトライ (attempt %d): %s",
                                        attempt + 1,
                                        pdf_err,
                                    )
                                    time.sleep(1)
                        if last_err is not None:
                            raise last_err
                    finally:
                        if saved_printer is not None:
                            try:
                                app.api.ActivePrinter = saved_printer
                            except Exception as restore_err:
                                logger.warning(
                                    "ActivePrinter の復元に失敗: %s", restore_err
                                )
                else:
                    for attempt in range(3):
                        try:
                            logger.info(
                                "Exporting Workbook to PDF (Raw API): %s (Attempt %d/3)",
                                pdf_abs_path,
                                attempt + 1,
                            )
                            book.api.ExportAsFixedFormat(
                                Type=0,
                                Filename=pdf_abs_path,
                                Quality=0,
                                IncludeDocProperties=True,
                                IgnorePrintAreas=False,
                                OpenAfterPublish=False,
                            )
                            last_err = None
                            break
                        except Exception as pdf_err:
                            last_err = pdf_err
                            if attempt < 2:
                                logger.warning(
                                    "PDF出力リトライ (attempt %d): %s",
                                    attempt + 1,
                                    pdf_err,
                                )
                                time.sleep(1)
                    if last_err is not None:
                        raise last_err
                if keep_excel and i == len(sorted_templates) - 1:
                    excel_path = output_pdf_path.with_suffix(".xlsx").resolve()
                    book.save(str(excel_path))
                    logger.info("Excel を保存しました: %s", excel_path)
                pdf_paths.append(part_pdf)
            finally:
                book.close()
        except Exception as e:
            logger.error(
                "PDF 出力に失敗しました（テンプレート index=%s, file_path=%s）: %s",
                i,
                t.file_path,
                e,
            )
            raise
        finally:
            if app is not None:
                try:
                    app.quit()
                except Exception as quit_err:
                    logger.warning("xlwings app.quit() error: %s", quit_err)
            if pid is not None:
                try:
                    proc = psutil.Process(pid)
                    if proc.is_running():
                        logger.info("Force killing Excel process (pid=%s)", pid)
                        proc.kill()
                except psutil.NoSuchProcess:
                    pass
                except Exception as ps_err:
                    logger.warning("psutil プロセス終了エラー: %s", ps_err)
            time.sleep(2)
            gc.collect()

    merger = PdfWriter()
    for p in pdf_paths:
        merger.append(str(p))
    merger.write(str(output_pdf_path))
    merger.close()

    return output_pdf_path


def generate_report_excel_zip(
    templates: list[TemplateLike],
    output_zip_path: str | Path,
    context: ReportContextLike,
    assets_base: str | Path,
) -> Path:
    """
    複数テンプレート Excel にコンテキストを流し込み、
    それぞれ個別の xlsx として保存後、ZIP 圧縮して出力する。
    """
    assets_base = Path(assets_base).resolve()
    output_zip_path = Path(output_zip_path).resolve()
    output_zip_path.parent.mkdir(parents=True, exist_ok=True)

    sorted_templates = sorted(
        [t for t in templates if t.file_path],
        key=lambda t: (
            t.sort_order if t.sort_order is not None else 999,
            t.file_path or "",
        ),
    )
    if not sorted_templates:
        raise ValueError("有効なテンプレートがありません。")

    base_temp = get_output_temp_dir()
    base_temp.mkdir(parents=True, exist_ok=True)
    run_dir = base_temp / f"excel_run_{int(time.time() * 1000)}_{os.getpid()}"
    run_dir.mkdir(parents=True, exist_ok=True)
    xlsx_paths: list[Path] = []

    for i, t in enumerate(sorted_templates):
        app = None
        pid = None
        try:
            app = xw.App(visible=False)
            pid = app.pid
            app.display_alerts = False
            app.screen_updating = False
            template_path = (assets_base / (t.file_path or "")).resolve()
            if not template_path.exists():
                raise FileNotFoundError(
                    f"テンプレートが見つかりません: {template_path}"
                )
            template_path_str = os.path.normpath(os.path.abspath(str(template_path)))
            logger.info("Opening template (pid=%s): %s", pid, template_path_str)
            book = app.books.open(template_path_str)
            try:
                for sheet in book.sheets:
                    _fill_sheet_placeholders(sheet, context)
                order = t.sort_order if t.sort_order is not None else (i + 1)
                safe_name = (
                    (t.name or Path(t.file_path or "").stem)
                    .replace("/", "_")
                    .replace("\\", "_")
                )
                out_name = f"{order:02d}_{safe_name}.xlsx"
                out_path = (run_dir / out_name).resolve()
                book.save(str(out_path))
                xlsx_paths.append(out_path)
                logger.info("Saved Excel: %s", out_path)
            finally:
                book.close()
        except Exception as e:
            logger.error(
                "Excel 出力に失敗しました（テンプレート index=%s, file_path=%s）: %s",
                i,
                t.file_path,
                e,
            )
            raise
        finally:
            if app is not None:
                try:
                    app.quit()
                except Exception as quit_err:
                    logger.warning("xlwings app.quit() error: %s", quit_err)
            if pid is not None:
                try:
                    proc = psutil.Process(pid)
                    if proc.is_running():
                        logger.info("Force killing Excel process (pid=%s)", pid)
                        proc.kill()
                except psutil.NoSuchProcess:
                    pass
                except Exception as ps_err:
                    logger.warning("psutil プロセス終了エラー: %s", ps_err)
            time.sleep(2)
            gc.collect()

    if output_zip_path.exists():
        output_zip_path.unlink()
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in xlsx_paths:
            zf.write(p, arcname=p.name)
    logger.info("Created ZIP: %s (%d files)", output_zip_path, len(xlsx_paths))

    return output_zip_path
