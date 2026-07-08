import React from 'react';
import QRCode from 'qrcode';
import { toast } from '../ui/Toast';

interface TierData {
  name: string;
  color: string;
  items: { title: string; labels: string[] }[];
}

interface ExportButtonProps {
  icebergTitle: string;
  tiers: TierData[];
  icebergUrl: string;
  labelColors?: Record<string, string>;
}

type Theme = 'light' | 'dark';


function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '')   // 移除 Windows 非法字符
    .replace(/\s+/g, '_')            // 空格转下划线
    .replace(/[^\w\u4e00-\u9fff-]/g, '') // 保留中英文、数字、下划线、连字符
    .slice(0, 50)                    // 限制长度
    .replace(/^[-_]+|[-_]+$/g, '')   // 去掉首尾的连字符/下划线
    || 'iceberg';                    // 空则回退
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const THEMES = {
  light: {
    bg:           '#ffffff',
    titleText:    '#0f172a',
    separator:    '#e2e8f0',
    tierHeaderBg: (color: string) => color + '18',
    itemsBg:      '#f8fafc',
    chipBg:       '#ffffff',
    chipBorder:   '#e2e8f0',
    chipText:     '#334155',
    badgeBorder:  '#cbd5e1',
    badgeText:    '#64748b',
    emptyText:    '#94a3b8',
    watermark:    '#94a3b8',
    itemsBorder:  '#e2e8f0',
  },
  dark: {
    bg:           '#0d1117',
    titleText:    '#cdd9e5',
    separator:    '#30363d',
    tierHeaderBg: (color: string) => color + '22',
    itemsBg:      '#0d1117',
    chipBg:       '#161b22',
    chipBorder:   '#30363d',
    chipText:     '#cdd9e5',
    badgeBorder:  '#30363d',
    badgeText:    '#8b949e',
    emptyText:    '#3d444d',
    watermark:    '#484f58',
    itemsBorder:  '#21262d',
  },
} as const;

// 常量（逻辑像素）
const W          = 900;
const SCALE      = 2;          // 高分辨率 2×
const PAD        = 36;
const CONTENT_W  = W - PAD * 2;
const CHIP_H     = 28;
const CHIP_PX    = 12;
const LABEL_DOT_SIZE = 6;
const LABEL_DOT_GAP  = 3;
const CHIP_GAP   = 8;
const ROW_GAP    = 8;
const TIER_GAP   = 12;
const ITEMS_PAD  = 14;
const HEADER_H   = 44;
const TITLE_H    = 74;         // 标题 + 副标题元数据行
const FOOTER_H   = 80;
const BAR_W      = 8;          // 层级左侧色条宽度
const BAR_GAP    = 14;         // 色条右侧到文字间距
const BORDER_W   = 2;          // 外边框宽度
const BRAND      = '#00FF41';  // 品牌色（暗色背景），浅色导出时用深色变体
const BRAND_LIGHT = '#16a34a';
const FONT_MONO  = '13px ui-monospace,"IBM Plex Mono",Consolas,monospace';
const FONT_SMALL = '11px ui-monospace,"IBM Plex Mono",Consolas,monospace';

function calcItemsHeight(
  ctx: CanvasRenderingContext2D,
  items: { title: string; labels: string[] }[],
): { rows: { title: string; labels: string[]; x: number }[][]; height: number } {
  if (items.length === 0) return { rows: [], height: ITEMS_PAD * 2 + 16 };

  ctx.font = FONT_SMALL;
  const maxW = CONTENT_W - BAR_W - ITEMS_PAD * 2;
  const rows: { title: string; labels: string[]; x: number }[][] = [];
  let row: { title: string; labels: string[]; x: number }[] = [];
  let x = 0;

  for (const item of items) {
    const labelW = item.labels.length > 0 ? item.labels.length * (LABEL_DOT_SIZE + LABEL_DOT_GAP) + 4 : 0;
    const cw = ctx.measureText(item.title).width + CHIP_PX * 2 + labelW;
    if (x > 0 && x + cw > maxW) { rows.push(row); row = []; x = 0; }
    row.push({ title: item.title, labels: item.labels, x });
    x += cw + CHIP_GAP;
  }
  if (row.length) rows.push(row);

  return {
    rows,
    height: ITEMS_PAD * 2 + rows.length * CHIP_H + (rows.length - 1) * ROW_GAP,
  };
}

async function drawExport(
  icebergTitle: string,
  tiers: TierData[],
  icebergUrl: string,
  theme: Theme,
  labelColors?: Record<string, string>,
): Promise<string> {
  const T = THEMES[theme];
  const brandColor = theme === 'dark' ? BRAND : BRAND_LIGHT;
  const totalItems = tiers.reduce((s, t) => s + t.items.length, 0);
  const totalTiers = tiers.length;
  const metaText = `${totalTiers} 层 · ${totalItems} 词条`;

  // Extract hostname + path for footer URL
  let shortUrl: string;
  try { const u = new URL(icebergUrl); shortUrl = u.host + u.pathname; } catch { shortUrl = icebergUrl; }

  // 第一遍：测量高度
  const measure = document.createElement('canvas').getContext('2d')!;
  const tierLayouts = tiers.map(t => calcItemsHeight(measure, t.items));

  let totalH = PAD + TITLE_H;
  tiers.forEach((_, i) => {
    totalH += HEADER_H + tierLayouts[i].height;
    if (i < tiers.length - 1) totalH += TIER_GAP;
  });
  totalH += PAD + FOOTER_H;

  // 创建高分辨率 Canvas
  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = totalH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // 背景
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, totalH);

  let y = PAD;

  // 标题区
  // 主标题：# icebergTitle
  ctx.font = `bold 17px ui-monospace,"IBM Plex Mono",Consolas,monospace`;
  ctx.textBaseline = 'middle';
  const hashW = ctx.measureText('# ').width;
  ctx.fillStyle = brandColor;
  ctx.fillText('#', PAD, y + 22);
  ctx.fillStyle = T.titleText;
  ctx.fillText(' ' + icebergTitle, PAD + hashW, y + 22);

  // 副标题：元数据
  ctx.font = FONT_SMALL;
  ctx.fillStyle = T.watermark;
  ctx.fillText(metaText, PAD, y + 46);

  // 分隔线
  ctx.strokeStyle = T.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + TITLE_H - 1);
  ctx.lineTo(W - PAD, y + TITLE_H - 1);
  ctx.stroke();
  y += TITLE_H;

  // 各层
  for (let ti = 0; ti < tiers.length; ti++) {
    const { name, color, items } = tiers[ti];
    const { rows, height: itemsH } = tierLayouts[ti];

    // 层 header
    ctx.fillStyle = T.tierHeaderBg(color);
    ctx.fillRect(PAD, y, CONTENT_W, HEADER_H);
    ctx.fillStyle = color;
    ctx.fillRect(PAD, y, BAR_W, HEADER_H);

    // 层名
    ctx.font = `bold ${FONT_MONO}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(name, PAD + BAR_W + BAR_GAP, y + HEADER_H / 2);

    // 词条数 badge
    const nameW = ctx.measureText(name).width;
    ctx.font = FONT_SMALL;
    const countText = `${items.length} 词条`;
    const countW = ctx.measureText(countText).width;
    const bx = PAD + BAR_W + BAR_GAP + nameW + 10;
    const bh = 18;
    const by = y + (HEADER_H - bh) / 2;
    ctx.strokeStyle = T.badgeBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, countW + 12, bh);
    ctx.fillStyle = T.badgeText;
    ctx.textBaseline = 'middle';
    ctx.fillText(countText, bx + 6, by + bh / 2);

    y += HEADER_H;

    // Items 容器
    ctx.fillStyle = T.itemsBg;
    ctx.fillRect(PAD, y, CONTENT_W, itemsH);
    ctx.fillStyle = color + '55';
    ctx.fillRect(PAD, y, BAR_W, itemsH);
    ctx.strokeStyle = T.itemsBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD + 0.5, y + 0.5, CONTENT_W - 1, itemsH - 1);

    if (items.length === 0) {
      ctx.font = FONT_SMALL;
      ctx.fillStyle = T.emptyText;
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无词条', PAD + BAR_W + ITEMS_PAD, y + itemsH / 2);
      } else {
      const ox = PAD + BAR_W + ITEMS_PAD;
      const oy = y + ITEMS_PAD;
      ctx.font = FONT_SMALL;
      for (let ri = 0; ri < rows.length; ri++) {
        const ry = oy + ri * (CHIP_H + ROW_GAP);
        for (const chip of rows[ri]) {
          var chipLabels = chip.labels || [];
          const labelW = chipLabels.length > 0 ? chipLabels.length * (LABEL_DOT_SIZE + LABEL_DOT_GAP) + 4 : 0;
          const cw = ctx.measureText(chip.title).width + CHIP_PX * 2 + labelW;
          const cx = ox + chip.x;
          ctx.fillStyle = T.chipBg;
          ctx.fillRect(cx, ry, cw, CHIP_H);
          ctx.strokeStyle = T.chipBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, ry + 0.5, cw - 1, CHIP_H - 1);
          ctx.fillStyle = T.chipText;
          ctx.textBaseline = 'middle';
          ctx.fillText(chip.title, cx + CHIP_PX, ry + CHIP_H / 2);
          // 标签圆点
          var dotLabels = chip.labels || [];
          if (dotLabels.length > 0) {
            var dotY = ry + CHIP_H / 2;
            var dotX = cx + CHIP_PX + ctx.measureText(chip.title).width + 6;
            for (var di = 0; di < dotLabels.length; di++) {
              var lc = (labelColors && labelColors[dotLabels[di]]) || color;
              ctx.fillStyle = lc;
              ctx.beginPath();
              ctx.arc(dotX + LABEL_DOT_SIZE / 2, dotY, LABEL_DOT_SIZE / 2, 0, Math.PI * 2);
              ctx.fill();
              dotX += LABEL_DOT_SIZE + LABEL_DOT_GAP;
            }
          }
        }
      }
    }

    y += itemsH;
    if (ti < tiers.length - 1) y += TIER_GAP;
  }

  y += PAD;

  // Footer
  const qrBg   = theme === 'dark' ? '#0A0A0A' : '#ffffff';
  const qrDark = theme === 'dark' ? '#00FF41' : '#0f172a';
  const qrDataUrl = await QRCode.toDataURL(icebergUrl, {
    width: 120, margin: 1,
    color: { dark: qrDark, light: qrBg },
  });
  const qrImg = new Image();
  await new Promise<void>(r => { qrImg.onload = () => r(); qrImg.src = qrDataUrl; });

  ctx.strokeStyle = T.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 16);
  ctx.lineTo(W - PAD, y + 16);
  ctx.stroke();

  ctx.font = FONT_SMALL;
  ctx.fillStyle = T.watermark;
  ctx.textBaseline = 'middle';
  ctx.fillText('冰山图宇宙 · icebergs.fun', PAD, y + 36);
  ctx.fillText(shortUrl, PAD, y + 54);

  const QR = 52;
  ctx.drawImage(qrImg, W - PAD - QR, y + 14, QR, QR);

  // 外边框
  ctx.strokeStyle = T.separator;
  ctx.lineWidth = BORDER_W;
  ctx.strokeRect(BORDER_W / 2, BORDER_W / 2, W - BORDER_W, totalH - BORDER_W);

  return canvas.toDataURL('image/png');
}

export function ExportButton({ icebergTitle, tiers, icebergUrl, labelColors }: ExportButtonProps) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [theme, setTheme] = React.useState<Theme>('light');

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const dataUrl = await drawExport(icebergTitle, tiers, icebergUrl, theme, labelColors);
      const link = document.createElement('a');
      link.download = `${sanitizeFilename(icebergTitle)}_${formatTimestamp()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('导出失败:', err);
      toast('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* 主题切换 */}
      <button
        onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        title={theme === 'light' ? '切换为深色导出' : '切换为浅色导出'}
        className="px-2.5 py-2 border border-border text-xs font-mono text-text-body hover:border-brand hover:text-brand transition-colors"
      >
        {theme === 'light' ? '☀' : '☾'}
      </button>
      {/* 导出按钮 */}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="px-4 py-2 bg-brand text-[#0A0A0A] font-medium rounded hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        {isExporting
          ? <><span className="animate-spin inline-block">⟳</span>导出中...</>
          : <><span>⬇</span>导出为图片</>}
      </button>
    </div>
  );
}
