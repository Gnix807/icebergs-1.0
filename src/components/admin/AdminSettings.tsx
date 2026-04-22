import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

const SETTING_META: Record<string, { label: string; hint: string }> = {
  // 管理员席位 & 选举
  admin_max:                    { label: '管理员席位上限',                  hint: '超过此数无法通过选举或任命新管理员（默认 3）' },
  election_apply_days:          { label: '选举申请期（天）',                hint: '创建选举时的候选人申请期默认值' },
  election_vote_days:           { label: '选举投票期（天）',                hint: '投票窗口默认时长' },
  election_candidate_min_days:  { label: '候选人最低注册天数',              hint: 'EDITOR/MODERATOR 候选资格最低账龄' },
  election_vote_min_days:       { label: '投票者最低注册天数',              hint: '低于此账龄的用户无投票资格' },
  // 版主人数上限
  moderator_max:           { label: '版主人数上限',                 hint: '超过此数无法任命新版主，调整后立即生效' },
  // 晋升门槛 — CONTRIBUTOR
  contributor_min_score:   { label: 'CONTRIBUTOR 最低质量分',       hint: '低于此分不可申请贡献者' },
  contributor_min_icebergs:{ label: 'CONTRIBUTOR 最低冰山图数',     hint: '至少发布此数量的冰山图' },
  contributor_min_days:    { label: 'CONTRIBUTOR 最低注册天数',     hint: '注册时间不足则无法申请' },
  // 晋升门槛 — EDITOR
  editor_min_score:        { label: 'EDITOR 最低质量分',            hint: '申请编辑所需的最低分' },
  editor_min_days:         { label: 'EDITOR 最低注册天数',          hint: '注册时间不足则无法申请' },
  // 晋升门槛 — MODERATOR
  moderator_min_score:     { label: 'MODERATOR 最低质量分',         hint: '申请版主所需的最低分' },
  moderator_min_days:      { label: 'MODERATOR 最低注册天数',       hint: '注册时间不足则无法申请' },
  // RfA（编辑资格申请）
  rfa_min_votes:           { label: 'EDITOR RfA 最低赞成票数',      hint: '原始票数（不加权），低于此数直接拒绝' },
  rfa_admin_min_votes:     { label: 'ADMIN RfA 最低有效票数',       hint: '高于 EDITOR 门槛' },
  rfa_pass_ratio:          { label: 'RfA 通过比例',                 hint: '加权票比例门槛，0.67 ≈ 2/3，范围 0~1' },
  rfa_vote_days:           { label: 'RfA 投票期（天）',             hint: '申请提交后开放投票的天数' },
  rfa_cooldown_days:       { label: 'RfA 失败冷却期（天）',         hint: '未通过后须等待此天数才能再次申请' },
  // 持续活跃质量分
  activity_comment_score:     { label: '发评论得分',                hint: '每发一条评论获得的质量分（受每日上限约束）' },
  activity_comment_daily_cap: { label: '评论每日计分上限（条）',    hint: '超过此数的评论当日不再得分' },
  activity_vote_score:        { label: '首次投票得分',              hint: '首次给某篇图投赞/踩获得的质量分（改票/撤票不计）' },
  activity_vote_daily_cap:    { label: '投票每日计分上限（次）',    hint: '超过此数的首次投票当日不再得分' },
  activity_like_score:        { label: '评论被点赞得分',            hint: '评论被他人点赞时给作者的得分，无每日上限' },
  activity_weekly_threshold:  { label: '周活跃奖励触发行为数',      hint: '本周（评论+首次投票）≥ 此数时发放周奖励' },
  activity_weekly_bonus:      { label: '周活跃奖励分值',            hint: '达到周活跃门槛后一次性发放的质量分' },
  // 弹劾流程
  impeach_vote_days:  { label: '弹劾投票期（天）',   hint: '弹劾发起后开放投票的天数' },
  impeach_pass_ratio: { label: '弹劾通过比例',       hint: '加权支持票占比门槛，0.67 ≈ 2/3，范围 0~1' },
  impeach_min_votes:  { label: '弹劾最低支持票数',   hint: '原始票数（不加权），低于此数直接拒绝' },
  // 账号管理
  warned1_auto_clear:      { label: 'WARNED_1 自动清除天数',        hint: '从违规日起计算' },
  warned2_appeal_days:     { label: 'WARNED_2 申诉冷却天数',        hint: '满该天数才可发起申诉' },
  promotion_expire:        { label: '晋升申请过期天数',              hint: '超期后申请自动关闭' },
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

  if (loading) return <div className="text-[#4b5563] font-mono text-sm py-8 text-center">// 加载中...</div>;

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-mono text-[#374151] mb-4">
        // 治理参数配置 · 修改后立即生效（懒加载计算）
      </div>

      {settings.map(s => {
        const meta = SETTING_META[s.key];
        return (
          <div key={s.key} className="border border-[#1a1a1a] bg-[#0a0c10] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-[#e5e5e5] mb-0.5">
                  {meta?.label ?? s.key}
                </div>
                <div className="text-[10px] font-mono text-[#374151]">
                  {meta?.hint ?? s.key}
                </div>
                <div className="text-[10px] font-mono text-[#2A2A2A] mt-1">
                  key: {s.key} · 更新于 {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <input
                type="text"
                value={edits[s.key] ?? s.value}
                onChange={e => setEdits(v => ({ ...v, [s.key]: e.target.value }))}
                className={`w-24 px-2 py-1.5 text-xs font-mono text-right bg-[#050505] border focus:outline-none transition-colors ${
                  edits[s.key] !== s.value
                    ? 'border-[#f59e0b] text-[#f59e0b]'
                    : 'border-[#2A2A2A] text-[#9ca3af] focus:border-[#00FF41]'
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
          className="px-5 py-2 text-xs font-mono bg-[#00FF4115] border border-[#00FF4140] text-[#00FF41] hover:bg-[#00FF4125] transition-colors disabled:opacity-40"
        >
          {saving ? '保存中...' : isDirty ? '保存修改' : '无更改'}
        </button>
      </div>
    </div>
  );
}
