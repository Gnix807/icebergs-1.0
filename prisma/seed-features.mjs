import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const toggles = [
  { key: 'feature_rfa',            value: 'false', label: 'RfA 编辑选举',             desc: '编辑资格申请与社区投票功能' },
  { key: 'feature_impeach',        value: 'false', label: '弹劾流程',                 desc: '弹劾管理员/版主的功能' },
  { key: 'feature_promotion',      value: 'false', label: '晋升申请',                 desc: '用户自主申请晋升为 CONTRIBUTOR' },
  { key: 'feature_appeals',        value: 'false', label: '申诉系统',                 desc: '封禁/警告后提交申诉的功能' },
  { key: 'feature_userboxes',      value: 'false', label: '用户框定制',               desc: '个人主页装饰性用户框' },
  { key: 'feature_privacy',        value: 'false', label: '隐私设置',                 desc: '公开统计/公开收藏夹开关' },
  { key: 'feature_quality_score',  value: 'true',  label: '质量分系统',               desc: '质量分展示与计算' },
  { key: 'feature_session_mgmt',   value: 'false', label: '多设备会话管理',          desc: '查看并管理登录会话列表' },
];

for (const t of toggles) {
  await p.systemSettings.upsert({
    where: { key: t.key },
    update: { value: t.value },
    create: { key: t.key, value: t.value },
  });
  console.log('Seeded:', t.key, '=', t.value);
}
console.log('Done');
await p.$disconnect();
