import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

const SETTING_META: Record<string, { label: string; hint: string }> = {
  // 管理员席位 & 选举
  admin_max:                    { label: '管理员席位上限',                  hint: '超过此数无法通过选举或任命新管理员，默认 3。设满后需要有人卸任才能增补。' },
  election_apply_days:          { label: '选举申请期（天）',                hint: '创建选举时，候选人提交申请的窗口期天数。' },
  election_candidate_min_days:  { label: '候选人最低注册天数',              hint: 'EDITOR/MODERATOR 候选资格：注册天数必须≥此值才能参选。' },
  election_vote_days:           { label: '选举投票期（天）',                hint: '申请截止后开放投票的天数。' },
  election_vote_min_days:       { label: '投票者最低注册天数',              hint: '低于此账龄的用户无权投票，防止小号刷票。' },
  // 版主人数上限
  moderator_max:           { label: '版主人数上限',                 hint: '超过此数无法任命新版主。已有版主达标则后续申请自动拒。' },
  // 晋升门槛 — CONTRIBUTOR
  contributor_min_score:   { label: 'CONTRIBUTOR 最低质量分',       hint: '低于此分无法提交晋升申请。默认 20。' },
  contributor_min_icebergs:{ label: 'CONTRIBUTOR 最低冰山图数',     hint: '至少发布并审核通过此数量的冰山图。默认 2。' },
  contributor_min_days:    { label: 'CONTRIBUTOR 最低注册天数',     hint: '注册不足此天数无法申请晋升。默认 7。' },
  // 晋升门槛 — EDITOR
  editor_min_score:        { label: 'EDITOR 最低质量分',            hint: '申请编辑权限所需的最低质量分。默认 100。' },
  editor_min_days:         { label: 'EDITOR 最低注册天数',          hint: '注册不足此天数无法申请 EDITOR。默认 30。' },
  // 晋升门槛 — MODERATOR
  moderator_min_score:     { label: 'MODERATOR 最低质量分',         hint: '申请版主所需的最低质量分。默认 300。' },
  moderator_min_days:      { label: 'MODERATOR 最低注册天数',       hint: '注册不足此天数无法申请 MODERATOR。默认 60。' },
  // RfA（编辑/管理员资格申请）
  rfa_min_votes:           { label: 'EDITOR RfA 最低有效票数',      hint: '原始票数（不加权），低于此数申请自动拒。默认 5。' },
  rfa_admin_min_votes:     { label: 'ADMIN RfA 最低有效票数',       hint: '比 EDITOR 门槛更高。加权投票防止小号刷票。默认 10。' },
  rfa_pass_ratio:          { label: 'RfA 通过比例',                 hint: '加权赞成票 /（赞成+反对）≥ 此值方可通过。0.67 即三分之二多数。' },
  rfa_vote_days:           { label: 'RfA 投票期（天）',             hint: '申请提交后公开投票的天数。后续无新票则可提前关闭。' },
  rfa_cooldown_days:       { label: 'RfA 失败冷却期（天）',         hint: 'RfA 被拒后需等待此天数才能再次申请。防止反复刷。' },
  // 弹劾流程
  impeach_vote_days:  { label: '弹劾投票期（天）',   hint: '弹劾发起后开放投票的天数。' },
  impeach_pass_ratio: { label: '弹劾通过比例',       hint: '加权支持票占比≥此值即通过。0.67 即三分之二多数。默认与 RfA 一致。' },
  impeach_min_votes:  { label: '弹劾最低有效票数',   hint: '原始票数（不加权），低于此数弹劾自动失败。' },
  // 账号管理
  warned1_auto_clear:      { label: 'WARNED_1 自动清除天数',        hint: '被警告后（级别1），间隔此天数且无新违规，警告自动清除。默认 90。' },
  warned2_appeal_days:     { label: 'WARNED_2 申诉冷却天数',        hint: '严重警告后需等待此天数方可提交申诉。' },
  promotion_expire:        { label: '晋升申请过期天数',              hint: 'CONTRIBUTOR 晋升申请超此天数未处理则自动关闭。' },
  // 持续活跃质量分
  activity_comment_score:     { label: '发评论得分',                hint: '每发一条评论获得的质量分。受下方每日上限约束。默认 1。' },
  activity_comment_daily_cap: { label: '评论每日计分上限（条）',    hint: '超过此评论数的当日不再得分。默认 5。' },
  activity_vote_score:        { label: '首次投票得分',              hint: '首次给某篇冰山投赞/踩获得的质量分。改票/撤票不重复计。默认 1。' },
  activity_vote_daily_cap:    { label: '投票每日计分上限（次）',    hint: '超过本次数的当日投票不再得分。默认 3。' },
  activity_like_score:        { label: '评论被点赞得分',            hint: '他人给你的评论点赞时，你获得的质量分。无每日上限。默认 1。' },
  activity_weekly_threshold:  { label: '周活跃奖励触发行为数',      hint: '本周（评论+投票）≥此数时，发放下方周奖励。默认 10。' },
  activity_weekly_bonus:      { label: '周活跃奖励分值',            hint: '达到阈值后一次性发放的质量分。默认 5。' },
};

export function AdminSettings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSettings(data.data);
          const initial: Record<string, string> = {};
          data.data.forEach((s: Setting) => { initial[s.key] = s.value; });
          setEdits(initial);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });
      const data = await res.json();
      if (data.success) {
        toast('配置已保存');
        setSettings(s => s.map(x => ({ ...x, value: edits[x.key] ?? x.value })));
      } else {
        toast(data.error?.message ?? '保存失败', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const isDirty = settings.some(s => edits[s.key] !== s.value);

  if (loading) return <div className="text-text-lo font-mono text-sm py-8 text-center">// 加载中...</div>;

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-mono text-text-mid mb-4">
        // 治理参数配置 · 修改后立即生效（懒加载计算）
      </div>

      {settings.filter(s => !s.key.startsWith('feature_')).map(s => {
        const meta = SETTING_META[s.key];
        return (
          <div key={s.key} className="border border-border-subtle bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-text-hi mb-0.5">
                  {meta?.label ?? s.key}
                </div>
                <div className="text-[10px] font-mono text-text-mid">
                  {meta?.hint ?? s.key}
                </div>
                <div className="text-[10px] font-mono text-text-lo mt-1">
                  key: {s.key} · 更新于 {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <input
                type="text"
                value={edits[s.key] ?? s.value}
                onChange={e => setEdits(v => ({ ...v, [s.key]: e.target.value }))}
                className={`w-24 px-2 py-1.5 text-xs font-mono text-right bg-surface-2 border focus:outline-none transition-colors ${
                  edits[s.key] !== s.value
                    ? 'border-warning text-warning'
                    : 'border-border text-text-body focus:border-brand'
                }`}
              />
            </div>
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="px-5 py-2 text-xs font-mono bg-brand/10 border border-brand/25 text-brand hover:bg-brand/15 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : isDirty ? '保存修改' : '无更改'}
        </button>
      </div>
    </div>
  );
}
