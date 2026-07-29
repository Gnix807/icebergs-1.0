import { useEffect, useState } from 'react';
import { toast } from '../ui/Toast';

const FLAGS = [
  { key: 'feature_rfa',            label: 'RfA 编辑选举',             desc: '编辑资格申请与社区投票功能' },
  { key: 'feature_impeach',        label: '弹劾流程',                 desc: '弹劾管理员/版主的功能' },
  { key: 'feature_promotion',      label: '晋升申请',                 desc: '用户自主申请晋升为 CONTRIBUTOR' },
  { key: 'feature_appeals',        label: '申诉系统',                 desc: '封禁/警告后提交申诉的功能' },
  { key: 'feature_userboxes',      label: '用户框定制',               desc: '个人主页装饰性用户框' },
  { key: 'feature_privacy',        label: '隐私设置',                 desc: '公开统计/公开收藏夹开关' },
  { key: 'feature_quality_score',  label: '旧版质量分历史',           desc: '质量分已冻结；此开关只控制旧历史入口，不恢复计分' },
  { key: 'feature_session_mgmt',   label: '多设备会话管理',          desc: '查看并管理登录会话列表' },
  { key: 'feature_git_collaboration', label: '冰山图版本控制',       desc: '工作副本、提交、分支、合并请求和发布快照' },
  { key: 'feature_capability_auth', label: '能力授权严格模式',       desc: '启用后全站权限只读取能力记录；上线前必须完成回填验证' },
  { key: 'feature_contribution_profiles', label: '多维贡献档案',    desc: '展示可审计的创作、协作、审阅和服务记录' },
  { key: 'feature_legacy_governance_write', label: '旧治理写入',    desc: '默认关闭；仅生产回滚时临时恢复旧流程写入' },
];

export function AdminFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/features')
      .then(r => r.json())
      .then(d => { if (d.success) setFlags(d.data); })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/settings?data=${encodeURIComponent(JSON.stringify({ features: flags }))}`);
      const data = await res.json();
      if (data.success) {
        toast('功能开关已保存，刷新页面后生效');
      } else {
        toast(data.error?.message || '保存失败', 'error');
      }
    } catch {
      toast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 font-mono">
        <span className="text-text-mid animate-pulse text-xs">// 加载功能开关...</span>
      </div>
    );
  }

  const enabledCount = Object.values(flags).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm text-text-hi">功能模块开关</div>
          <div className="font-mono text-[10px] text-text-mid mt-1">
            已开启 {enabledCount} / {FLAGS.length} 个模块 · 保存后立即生效
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-brand text-[#171717] text-xs font-mono font-bold hover:bg-brand-hover transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div className="space-y-2">
        {FLAGS.map(f => (
          <div
            key={f.key}
            className="flex items-center justify-between p-3 border border-border-subtle bg-surface-2"
          >
            <div>
              <div className="text-xs font-mono text-text-hi">{f.label}</div>
              <div className="text-[10px] font-mono text-text-mid mt-0.5">{f.desc}</div>
            </div>
            <button
              onClick={() => toggle(f.key)}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                flags[f.key] ? 'bg-brand' : 'bg-surface-0 border border-border-subtle'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${
                  flags[f.key] ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
