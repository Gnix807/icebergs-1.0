import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';

interface Props {
  icebergId: string;
}

export function SocialBar({ icebergId }: Props) {
  const [score, setScore] = useState(0);
  const [userVote, setUserVote] = useState(0);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/icebergs/${icebergId}/social`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setScore(d.data.score);
          setUserVote(d.data.userVote);
          setInWatchlist(d.data.inWatchlist);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [icebergId]);

  const handleVote = async (value: 1 | -1) => {
    const res = await fetch(`/api/icebergs/${icebergId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const data = await res.json();
    if (res.status === 401) {
      toast('请先登录', 'error');
      return;
    }
    if (data.success) {
      setScore(data.data.score);
      setUserVote(data.data.userVote);
    }
  };

  const handleWatchlist = async () => {
    const res = await fetch(`/api/icebergs/${icebergId}/watchlist`, {
      method: 'POST',
    });
    const data = await res.json();
    if (res.status === 401) {
      toast('请先登录', 'error');
      return;
    }
    if (data.success) {
      setInWatchlist(data.data.inWatchlist);
      toast(data.data.inWatchlist ? '已添加收藏' : '已取消收藏');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-[#374151]">
        <span>loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Upvote */}
      <button
        onClick={() => handleVote(1)}
        className={`vote-btn flex items-center gap-1 px-2 py-1 border text-xs font-mono transition-colors ${
          userVote === 1
            ? 'active-up'
            : 'border-[#2A2A2A] text-[#6b7280] hover:border-[#22c55e] hover:text-[#22c55e]'
        }`}
      >
        ▲ {score > 0 ? `+${score}` : score < 0 ? score : ''}
      </button>

      {/* Downvote */}
      <button
        onClick={() => handleVote(-1)}
        className={`vote-btn flex items-center gap-1 px-2 py-1 border text-xs font-mono transition-colors ${
          userVote === -1
            ? 'active-down'
            : 'border-[#2A2A2A] text-[#6b7280] hover:border-[#ef4444] hover:text-[#ef4444]'
        }`}
      >
        ▼
      </button>

      {/* Watchlist */}
      <button
        onClick={handleWatchlist}
        className={`flex items-center gap-1 px-2 py-1 border text-xs font-mono transition-colors ${
          inWatchlist
            ? 'border-[#f59e0b] text-[#f59e0b]'
            : 'border-[#2A2A2A] text-[#6b7280] hover:border-[#f59e0b] hover:text-[#f59e0b]'
        }`}
      >
        {inWatchlist ? '★' : '☆'} 收藏
      </button>
    </div>
  );
}
