import { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/Toast';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { AdminListSkeleton } from '../ui/Skeleton';

interface UserRow {
  id: string;
  username: string;
  nickname: string | null;
  email: string;
  role: string;
  status: string;
  qualityScore: number;
  createdAt: string;
  banUntil: string | null;
  isFounder?: boolean;
  _count: { icebergs: number };
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:      '#22c55e',
  WARNED_1:    '#f59e0b',
  WARNED_2:    '#f97316',
  READ_ONLY:   '#3b82f6',
  TEMP_BANNED: '#ef4444',
  PERM_BANNED: '#7f1d1d',
};

const ROLE_COLOR: Record<string, string> = {
  USER:        '#4b5563',
  CONTRIBUTOR: '#22c55e',
  EDITOR:      '#3b82f6',
  ADMIN:       '#f59e0b',
};

interface ActionModal {
  user: UserRow;
  type: 'warn' | 'restrict' | 'ban' | 'unban' | 'role';
}

const APPOINT_ROLES = ['USER', 'CONTRIBUTOR', 'EDITOR', 'MODERATOR'] as const;

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const { mounted: modalMounted, isLeaving: modalLeaving } = useModalAnimation(modal !== null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (q) params.set('q', q);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) { setUsers(data.data.users); setTotal(data.data.total); }
    } finally {
      setLoading(false);
    }
  }, [q, roleFilter, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const doAction = async () => {
    if (!modal) return;
    setActing(true);
    try {
      let url = '';
      let body: Record<string, unknown> = {};

      if (modal.type === 'warn') {
        url = `/api/users/${modal.user.id}/warn`;
        body = { level: Number(formData.level ?? 1), reason: formData.reason };
      } else if (modal.type === 'restrict') {
        url = `/api/users/${modal.user.id}/restrict`;
        body = { reason: formData.reason };
      } else if (modal.type === 'ban') {
        url = `/api/users/${modal.user.id}/ban`;
        body = { type: formData.banType ?? 'TEMP', days: Number(formData.days ?? 7), reason: formData.reason };
      } else if (modal.type === 'unban') {
        url = `/api/users/${modal.user.id}/unban`;
        body = { reason: formData.reason ?? '管理员手动解除' };
      }

      if (modal.type === 'role') {
        url = `/api/users/${modal.user.id}/role`;
        body = { role: formData.role, reason: formData.reason };
      }

      const res = await fetch(url, {
        method: modal.type === 'role' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast('操作成功');
        setModal(null);
        setFormData({});
        load();
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* 搜索栏 */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="// 搜索用户名 / 邮箱"
          className="flex-1 min-w-[160px] px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-body focus:border-brand focus:outline-none"
        />
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-body focus:outline-none"
        >
          <option value="">全部角色</option>
          <option value="USER">USER</option>
          <option value="CONTRIBUTOR">CONTRIBUTOR</option>
          <option value="EDITOR">EDITOR</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-body focus:outline-none"
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="WARNED_1">WARNED_1</option>
          <option value="WARNED_2">WARNED_2</option>
          <option value="READ_ONLY">READ_ONLY</option>
          <option value="TEMP_BANNED">TEMP_BANNED</option>
          <option value="PERM_BANNED">PERM_BANNED</option>
        </select>
      </div>

      {loading ? (
        <AdminListSkeleton rows={5} />
      ) : (
        <>
          <div className="text-[10px] font-mono text-text-mid mb-2">// {total} 个用户</div>

          <div className="space-y-1.5">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 border border-border-subtle hover:border-border transition-colors">
                <a href={`/user/${u.id}`} className="flex-1 min-w-0 group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-text-hi group-hover:text-brand transition-colors">
                      @{u.nickname ?? u.username}
                    </span>
                    {u.isFounder && (
                      <span className="text-[10px] font-mono border px-1"
                        style={{ color: '#f59e0b', borderColor: '#f59e0b50', background: '#f59e0b0d' }}>
                        ◆ FOUNDER
                      </span>
                    )}
                    <span
                      className="text-[10px] font-mono border px-1"
                      style={{ color: ROLE_COLOR[u.role], borderColor: `${ROLE_COLOR[u.role]}40` }}
                    >
                      {u.role}
                    </span>
                    <span
                      className="text-[10px] font-mono border px-1"
                      style={{ color: STATUS_COLOR[u.status] ?? '#6b7280', borderColor: `${STATUS_COLOR[u.status] ?? '#6b7280'}40` }}
                    >
                      {u.status}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-text-mid mt-0.5">
                    {u.qualityScore} pts · {u._count.icebergs} 冰山图 · {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                    {u.banUntil && <span className="text-danger ml-2">封至 {new Date(u.banUntil).toLocaleDateString('zh-CN')}</span>}
                  </div>
                </a>

                {/* 操作按钮 */}
                <div className="flex gap-1.5 flex-shrink-0">
                  {!u.isFounder && (
                    <button
                      onClick={() => { setModal({ user: u, type: 'role' }); setFormData({ role: u.role }); }}
                      className="btn-purple px-2 py-1 text-[10px] font-mono border border-[#8b5cf630] text-purple hover:bg-purple/10 transition-colors"
                    >
                      任命
                    </button>
                  )}
                  {u.status === 'ACTIVE' || u.status === 'WARNED_1' ? (
                    <button
                      onClick={() => { setModal({ user: u, type: 'warn' }); setFormData({ level: '1' }); }}
                      className="btn-warn px-2 py-1 text-[10px] font-mono border border-warning/20 text-warning hover:bg-warning/10 transition-colors"
                    >
                      警告
                    </button>
                  ) : null}
                  {(u.status === 'ACTIVE' || u.status.startsWith('WARNED')) && (
                    <button
                      onClick={() => { setModal({ user: u, type: 'restrict' }); setFormData({}); }}
                      className="btn-info px-2 py-1 text-[10px] font-mono border border-[#3b82f630] text-info hover:bg-info/10 transition-colors"
                    >
                      只读
                    </button>
                  )}
                  {u.status !== 'PERM_BANNED' && u.status !== 'TEMP_BANNED' && (
                    <button
                      onClick={() => { setModal({ user: u, type: 'ban' }); setFormData({ banType: 'TEMP', days: '7' }); }}
                      className="btn-danger px-2 py-1 text-[10px] font-mono border border-[#ef444430] text-danger hover:bg-danger/10 transition-colors"
                    >
                      封禁
                    </button>
                  )}
                  {u.status !== 'ACTIVE' && (
                    <button
                      onClick={() => { setModal({ user: u, type: 'unban' }); setFormData({ reason: '管理员手动解除' }); }}
                      className="btn-success px-2 py-1 text-[10px] font-mono border border-[#22c55e30] text-success hover:bg-success/10 transition-colors"
                    >
                      解除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2.5 py-1 text-xs font-mono border transition-colors ${
                    page === p
                      ? 'border-brand text-brand'
                      : 'border-border text-text-lo hover:border-border'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 操作模态框 */}
      {modalMounted && modal && (
        <div className={`${modalLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${modalLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-sm p-5 font-mono`}>
            <div className="text-xs text-text-lo mb-1">对象：@{modal.user.nickname ?? modal.user.username}</div>
            <div className="text-sm text-text-hi mb-4">
              {modal.type === 'warn' && '发出警告'}
              {modal.type === 'restrict' && '设为只读'}
              {modal.type === 'ban' && '封禁用户'}
              {modal.type === 'unban' && '解除限制'}
              {modal.type === 'role' && '直接任命角色'}
            </div>

            {modal.type === 'role' && (
              <div className="mb-3">
                <div className="text-[10px] text-text-lo mb-1">目标角色</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {APPOINT_ROLES.map(r => (
                    <button
                      key={r}
                      onClick={() => setFormData(f => ({ ...f, role: r }))}
                      className={`py-1.5 text-xs font-mono border transition-colors ${
                        formData.role === r
                          ? 'border-[#8b5cf6] text-purple bg-purple/10'
                          : 'border-border text-text-lo hover:border-border'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modal.type === 'warn' && (
              <div className="mb-3">
                <div className="text-[10px] text-text-lo mb-1">警告等级</div>
                <div className="flex gap-2">
                  {(['1', '2'] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => setFormData(f => ({ ...f, level: l }))}
                      className={`flex-1 py-1.5 text-xs border transition-colors ${
                        formData.level === l
                          ? 'border-warning text-warning'
                          : 'border-border text-text-lo hover:border-border'
                      }`}
                    >
                      WARNED_{l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modal.type === 'ban' && (
              <div className="mb-3 space-y-2">
                <div className="flex gap-2">
                  {(['TEMP', 'PERM'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setFormData(f => ({ ...f, banType: t }))}
                      className={`flex-1 py-1.5 text-xs border transition-colors ${
                        formData.banType === t
                          ? 'border-danger text-danger'
                          : 'border-border text-text-lo hover:border-border'
                      }`}
                    >
                      {t === 'TEMP' ? '临时封禁' : '永久封禁'}
                    </button>
                  ))}
                </div>
                {formData.banType !== 'PERM' && (
                  <div>
                    <div className="text-[10px] text-text-lo mb-1">天数</div>
                    <input
                      type="number"
                      min={1}
                      value={formData.days ?? '7'}
                      onChange={e => setFormData(f => ({ ...f, days: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-surface-2 border border-border text-xs text-text-hi focus:border-brand focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {(modal.type !== 'unban') && (
              <div className="mb-4">
                <div className="text-[10px] text-text-lo mb-1">
                  {modal.type === 'role' ? '备注（可选）' : '理由'}
                </div>
                <textarea
                  value={formData.reason ?? ''}
                  onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-surface-2 border border-border text-xs text-text-hi focus:border-brand focus:outline-none resize-none"
                  placeholder={modal.type === 'role' ? '备注原因（可选）' : '理由（至少 5 字）'}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setFormData({}); }}
                className="btn-ghost flex-1 py-2 border border-border text-xs hover:border-border transition-colors"
              >
                取消
              </button>
              <button
                onClick={doAction}
                disabled={
                  acting ||
                  (modal.type !== 'unban' && modal.type !== 'role' && (formData.reason ?? '').trim().length < 5) ||
                  (modal.type === 'role' && (!formData.role || formData.role === modal.user.role))
                }
                className={`flex-1 py-2 text-xs transition-colors disabled:opacity-40 ${
                  modal.type === 'role'
                    ? 'btn-purple bg-purple/20 border border-[#8b5cf650] text-purple hover:bg-purple/20'
                    : 'btn-danger bg-danger/20 border border-[#ef444450] text-danger hover:bg-danger/20'
                }`}
              >
                {acting ? '执行中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
