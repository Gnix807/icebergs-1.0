import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const toggles = [
  { key: 'feature_rfa',            value: 'false', label: 'RfA 编辑选举',             desc: '编辑资格申请与社区投票功能' },
  { key: 'feature_impeach',        value: 'false', label: '弹劾流程',                 desc: '弹劾管理员/版主的功能' },
  { key: 'feature_promotion',      value: 'false', label: '晋升申请',                 desc: '用户自主申请晋升为 CONTRIBUTOR' },
  { key: 'feature_appeals',        value: 'false', label: '申诉系统',                 desc: '封禁/警告后提交申诉的功能' },
  { key: 'feature_userboxes',      value: 'false', label: '用户框定制',               desc: '个人主页装饰性用户框' },
  { key: 'feature_privacy',        value: 'false', label: '隐私设置',                 desc: '公开统计/公开收藏夹开关' },
  { key: 'feature_quality_score',  value: 'false', label: '旧版质量分历史',           desc: '旧质量分已冻结，仅保留本人历史查看' },
  { key: 'feature_session_mgmt',   value: 'false', label: '多设备会话管理',          desc: '查看并管理登录会话列表' },
  { key: 'feature_git_collaboration', value: 'true', label: '冰山图版本控制', desc: '工作副本、提交、分支、合并请求和发布快照' },
  { key: 'feature_capability_auth', value: 'false', label: '能力授权严格模式', desc: '启用后不再从旧角色推导全站能力' },
  { key: 'feature_contribution_profiles', value: 'true', label: '多维贡献档案', desc: '展示创作、协作、审阅和服务四类贡献' },
  { key: 'feature_legacy_governance_write', value: 'false', label: '旧治理写入', desc: '仅回滚时临时启用；默认保持旧治理只读' },
];

for (const t of toggles) {
  await p.systemSettings.upsert({
    where: { key: t.key },
    // 只补缺省值，不覆盖管理员在生产环境中已经调整过的开关。
    update: {},
    create: { key: t.key, value: t.value },
  });
  console.log('Ensured:', t.key);
}
console.log('Done');
await p.$disconnect();
