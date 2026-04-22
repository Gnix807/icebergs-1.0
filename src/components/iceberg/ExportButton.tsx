import React from 'react';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';

interface ExportButtonProps {
  targetId: string;
  icebergUrl: string;
}

export function ExportButton({ targetId, icebergUrl }: ExportButtonProps) {
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = async () => {
    const target = document.getElementById(targetId);
    if (!target) return;

    setIsExporting(true);

    try {
      // 生成 QR 码
      const qrDataUrl = await QRCode.toDataURL(icebergUrl, {
        width: 120,
        margin: 1,
        color: {
          dark: '#00FF41',
          light: '#0A0A0A',
        },
      });

      // 创建导出容器
      const exportContainer = document.createElement('div');
      exportContainer.style.cssText = `
        background: #0A0A0A;
        padding: 32px;
        width: 800px;
        font-family: 'JetBrains Mono', monospace;
      `;

      // 克隆内容
      const clone = target.cloneNode(true) as HTMLElement;
      clone.style.cssText = `
        color: #e5e5e5;
        width: 100%;
      `;
      exportContainer.appendChild(clone);

      // 添加 QR 码和底部水印
      const footer = document.createElement('div');
      footer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #2A2A2A;
      `;

      const watermark = document.createElement('span');
      watermark.style.cssText = `
        color: #6b7280;
        font-size: 12px;
      `;
      watermark.textContent = '冰山图宇宙 | iceberg.chat';

      const qrImg = document.createElement('img');
      qrImg.src = qrDataUrl;
      qrImg.style.cssText = 'width: 60px; height: 60px;';

      footer.appendChild(watermark);
      footer.appendChild(qrImg);
      exportContainer.appendChild(footer);

      // 添加到 body
      document.body.appendChild(exportContainer);

      // 生成图片
      const dataUrl = await toPng(exportContainer, {
        width: 800,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
      });

      // 下载
      const link = document.createElement('a');
      link.download = `冰山图-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      // 清理
      document.body.removeChild(exportContainer);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="px-4 py-2 bg-[#00FF41] text-[#0A0A0A] font-medium rounded hover:bg-[#00CC33] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      {isExporting ? (
        <>
          <span className="animate-spin">⟳</span>
          导出中...
        </>
      ) : (
        <>
          <span>⬇</span>
          导出为图片
        </>
      )}
    </button>
  );
}
