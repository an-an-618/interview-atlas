import {
  AlertTriangle,
  Download,
  FileJson,
  LoaderCircle,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import {
  MAX_WORKSPACE_IMPORT_BYTES,
  parseWorkspaceExport,
  type ParsedWorkspaceExport,
} from "../data/workspaceImport";
import type { Workspace } from "../domain/types";
import { Modal } from "./Modal";

interface WorkspaceMigrationProps {
  hasData: boolean;
  onRestore: (workspace: Workspace) => Promise<void>;
}

interface ImportPreview {
  fileName: string;
  fileSize: number;
  backup: ParsedWorkspaceExport;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExportedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WorkspaceMigration({
  hasData,
  onRestore,
}: WorkspaceMigrationProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const chooseFile = () => {
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    if (file.size > MAX_WORKSPACE_IMPORT_BYTES) {
      setError("文件超过 25 MB，无法在本机安全解析。");
      return;
    }

    try {
      const backup = parseWorkspaceExport(await file.text());
      setPreview({
        fileName: file.name,
        fileSize: file.size,
        backup,
      });
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "无法读取这个备份文件。",
      );
    }
  };

  const restore = async () => {
    if (!preview || importing) return;
    setImporting(true);
    setError(null);
    try {
      await onRestore(preview.backup.workspace);
      setPreview(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? `导入失败：${reason.message}`
          : "导入失败，本机当前工作区未被替换。",
      );
    } finally {
      setImporting(false);
    }
  };

  const counts = preview
    ? [
        ["面试记录", preview.backup.workspace.interviews.length],
        ["原子问答", preview.backup.workspace.questions.length],
        ["同步块", preview.backup.workspace.syncBlocks.length],
        ["简历经历", preview.backup.workspace.resumeExperiences.length],
        ["AI 审核", preview.backup.workspace.aiReviews.length],
        ["复习记录", preview.backup.workspace.reviewEvents.length],
      ]
    : [];

  return (
    <>
      <section className="settings-section action-section">
        <div>
          <Download size={20} aria-hidden="true" />
          <span>
            <strong>导入 JSON 备份</strong>
            <small>
              选择其他设备导出的千面备份；校验通过后，将替换本机当前工作区。
            </small>
            {error && !preview ? (
              <small className="migration-error" role="alert">
                {error}
              </small>
            ) : null}
          </span>
        </div>
        <input
          ref={inputRef}
          className="migration-file-input"
          type="file"
          accept=".json,application/json"
          onChange={readFile}
        />
        <button className="button secondary" type="button" onClick={chooseFile}>
          <Download size={16} aria-hidden="true" />
          选择备份
        </button>
      </section>

      {preview ? (
        <Modal
          eyebrow="数据迁移"
          title="确认导入备份"
          description="文件已在本机完成格式和关系校验，尚未写入数据库。"
          onClose={() => {
            if (!importing) {
              setPreview(null);
              setError(null);
            }
          }}
        >
          <div className="migration-dialog">
            <div className="migration-source">
              <FileJson size={22} aria-hidden="true" />
              <span>
                <strong>{preview.fileName}</strong>
                <small>
                  {formatFileSize(preview.fileSize)} · 格式版本{" "}
                  {preview.backup.formatVersion} · 导出于{" "}
                  {formatExportedAt(preview.backup.exportedAt)}
                </small>
              </span>
            </div>

            <dl className="migration-counts">
              {counts.map(([label, count]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>

            <div className="migration-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              <p>
                {hasData
                  ? "导入会完整替换本机当前工作区。建议先下载一份现有备份；AI API Key 和服务配置不会被改动。"
                  : "导入后，这份备份将成为本机当前工作区；AI API Key 和服务配置不会被导入。"}
              </p>
            </div>

            {error ? (
              <p className="migration-dialog-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                disabled={importing}
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                disabled={importing}
                onClick={restore}
              >
                {importing ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                {importing ? "正在导入" : "导入并替换"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
