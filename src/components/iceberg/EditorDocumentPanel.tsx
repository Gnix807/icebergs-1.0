import type { Iceberg } from '../../stores/icebergStore';
import { ICEBERG_TOPICS, normalizeIcebergTopic } from '../../lib/icebergTopic';

interface EditorDocumentPanelProps {
  iceberg: Iceberg;
  customSlug: string;
  slugError: string | null;
  useCustomTopic: boolean;
  customTopicInput: string;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onTopicSelect: (value: string) => void;
  onCustomTopicChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDelete?: () => void;
  idPrefix: string;
}

export function EditorDocumentPanel({
  iceberg,
  customSlug,
  slugError,
  useCustomTopic,
  customTopicInput,
  onTitleChange,
  onSlugChange,
  onTopicSelect,
  onCustomTopicChange,
  onDescriptionChange,
  onDelete,
  idPrefix,
}: EditorDocumentPanelProps) {
  const titleId = `${idPrefix}-title`;
  const slugId = `${idPrefix}-slug`;
  const topicId = `${idPrefix}-topic`;
  const descriptionId = `${idPrefix}-description`;
  return (
    <div className="editor-document-panel space-y-5 p-4 lg:p-5">
      {iceberg.status === 'PENDING_REVIEW' && (
        <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 font-mono text-[11px] text-warning">
          已提交，等待编辑审核
        </div>
      )}
      {iceberg.status === 'REJECTED' && (
        <div className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2">
          <p className="mb-1 font-mono text-[11px] text-danger">审核反馈</p>
          <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-hi">
            {iceberg.review?.note?.trim() || '本次驳回未附加文字说明，请根据规范调整后重新提交。'}
          </p>
        </div>
      )}

      <div>
        <label htmlFor={titleId} className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.12em] text-text-mid">
          标题
        </label>
        <input id={titleId} type="text" value={iceberg.title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2.5 font-mono text-sm text-text-hi outline-none transition-[border-color,box-shadow,background-color] focus:border-brand focus:bg-surface-0 focus:shadow-[0_0_0_3px_rgba(0,255,65,0.08)]"
          placeholder="冰山图标题" />
      </div>

      <div>
        <label htmlFor={slugId} className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.12em] text-text-mid">
          地址
        </label>
        <div className="flex min-w-0 overflow-hidden rounded-lg">
          <span className="shrink-0 border border-r-0 border-border-subtle bg-surface-2 px-2.5 py-2 font-mono text-[10px] text-text-lo">
            /iceberg/
          </span>
          {iceberg.id.startsWith('temp_') ? (
            <input id={slugId} type="text" value={customSlug}
              onChange={(event) => onSlugChange(event.target.value)}
              className={`min-w-0 flex-1 border bg-surface-0 px-2.5 py-2 font-mono text-xs outline-none transition-[border-color,box-shadow] ${
                slugError ? 'border-danger text-danger' : 'border-border-subtle text-text-hi focus:border-brand focus:shadow-[inset_0_0_0_1px_rgba(0,255,65,0.16)]'
              }`}
              placeholder="my-iceberg-id" spellCheck={false} />
          ) : (
            <span id={slugId}
              className="min-w-0 flex-1 truncate border border-border-subtle bg-surface-0 px-2 py-2 font-mono text-xs text-text-mid">
              {iceberg.slug || iceberg.id}
            </span>
          )}
        </div>
        {iceberg.id.startsWith('temp_') && (
          <p className={`mt-1 font-mono text-[10px] ${slugError ? 'text-danger' : 'text-text-lo'}`}>
            {slugError ?? '字母、数字、连字符或下划线，创建后不可修改'}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={topicId} className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.12em] text-text-mid">
          主题分类
        </label>
        <select id={topicId}
          value={useCustomTopic ? '__custom__' : normalizeIcebergTopic(iceberg.topic)}
          onChange={(event) => onTopicSelect(event.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2.5 font-mono text-sm text-text-hi outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgba(0,255,65,0.08)]">
          {ICEBERG_TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>{topic.label}</option>
          ))}
          <option value="__custom__">自定义分类...</option>
        </select>
        {useCustomTopic && (
          <div className="mt-2">
            <input type="text" value={customTopicInput}
              onChange={(event) => onCustomTopicChange(event.target.value)}
              placeholder="例如：动漫、冷知识、互联网谜团"
              className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2.5 font-mono text-sm text-text-hi outline-none placeholder:text-text-lo focus:border-brand focus:shadow-[0_0_0_3px_rgba(0,255,65,0.08)]" />
            <p className="mt-1 font-mono text-[10px] text-text-lo">最多 24 字</p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor={descriptionId} className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.12em] text-text-mid">
          简介
        </label>
        <textarea id={descriptionId} value={iceberg.description || ''}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="w-full resize-y rounded-lg border border-border-subtle bg-surface-0 px-3 py-2.5 font-mono text-xs leading-relaxed text-text-hi outline-none placeholder:text-text-mid focus:border-brand focus:shadow-[0_0_0_3px_rgba(0,255,65,0.08)]"
          rows={5} placeholder="冰山图简介（可选，支持 Markdown）" />
      </div>

      {onDelete && (
        <div className="border-t border-border-subtle pt-4">
          <button type="button" onClick={onDelete}
            className="min-h-11 w-full rounded-lg border border-danger/25 px-3 py-2 font-mono text-xs text-text-lo transition-colors hover:border-danger/60 hover:bg-danger/5 hover:text-danger">
            [ 删除冰山图 ]
          </button>
        </div>
      )}
    </div>
  );
}
