import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Clock, Trash2, Copy, Shield, 
  ChevronDown, X, ArrowLeft, Search, Calendar
} from "lucide-react";

interface HistoryPageProps {
  onBack?: () => void;
}

interface HistoryItem {
  id: string;
  text: string;
  timestamp: number;
  date: string;
  char_count: number;
}

type HistoryRetention = "7days" | "30days" | "90days" | "forever";

const RETENTION_OPTIONS = [
  { value: "7days", label: "7 天" },
  { value: "30days", label: "30 天" },
  { value: "90days", label: "90 天" },
  { value: "forever", label: "永久" },
];

function HistoryPage({ onBack }: HistoryPageProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [retention, setRetention] = useState<HistoryRetention>("forever");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
    loadRetention();
  }, []);

  const loadHistory = async () => {
    try {
      const items = await invoke<HistoryItem[]>("get_history");
      setHistory(items);
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadRetention = async () => {
    try {
      const ret = await invoke<HistoryRetention>("get_history_retention");
      setRetention(ret);
    } catch (e) {
      console.error("Failed to load retention:", e);
    }
  };

  const handleRetentionChange = async (newRetention: HistoryRetention) => {
    try {
      await invoke("set_history_retention", { retention: newRetention });
      setRetention(newRetention);
      // Reload history to apply retention
      loadHistory();
    } catch (e) {
      console.error("Failed to set retention:", e);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_history_item", { id });
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.error("Failed to delete item:", e);
    }
  };

  const handleClearAll = async () => {
    try {
      await invoke("clear_history");
      setHistory([]);
      setShowDeleteConfirm(false);
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  };

  const handleDeleteSelected = async () => {
    try {
      for (const id of selectedItems) {
        await invoke("delete_history_item", { id });
      }
      setHistory(prev => prev.filter(item => !selectedItems.has(item.id)));
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
    } catch (e) {
      console.error("Failed to delete selected:", e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedItems.size === filteredHistory.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredHistory.map(item => item.id)));
    }
  };

  // 按日期分组历史记录
  const groupedHistory = useMemo(() => {
    const filtered = history.filter(item => 
      item.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    const groups: Record<string, HistoryItem[]> = {};
    
    filtered.forEach(item => {
      const date = item.date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
    });
    
    // 按日期降序排序
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => b.timestamp - a.timestamp),
      }));
  }, [history, searchQuery]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => 
      item.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [history, searchQuery]);

  const formatDate = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (dateStr === today) return "今天";
    if (dateStr === yesterday) return "昨天";
    
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  };

  const retentionLabel = RETENTION_OPTIONS.find(o => o.value === retention)?.label || "永久";

  return (
    <div className="history-page">
      {/* 头部 */}
      <header className="history-header">
        <div className="history-header-left">
          {onBack && (
            <button className="back-btn" onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1>历史记录</h1>
            <p className="header-subtitle">查看和管理您的转录记录</p>
          </div>
        </div>
        <div className="history-header-actions">
          {selectedItems.size > 0 ? (
            <>
              <span className="selected-count">已选择 {selectedItems.size} 项</span>
              <button 
                className="action-btn danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={16} />
                删除
              </button>
              <button className="action-btn" onClick={() => setSelectedItems(new Set())}>
                取消
              </button>
            </>
          ) : (
            <button 
              className="action-btn"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={history.length === 0}
            >
              <Trash2 size={16} />
              清空
            </button>
          )}
        </div>
      </header>

      {/* 设置卡片 */}
      <div className="history-settings">
        <div className="setting-card">
          <div className="setting-card-icon">
            <Clock size={20} />
          </div>
          <div className="setting-card-content">
            <h3>保留历史记录</h3>
            <p>您希望在设备上保留转录历史记录多长时间？</p>
          </div>
          <div className="retention-select">
            <button className="retention-btn">
              {retentionLabel}
              <ChevronDown size={16} />
            </button>
            <div className="retention-dropdown">
              {RETENTION_OPTIONS.map(option => (
                <button
                  key={option.value}
                  className={retention === option.value ? "active" : ""}
                  onClick={() => handleRetentionChange(option.value as HistoryRetention)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="setting-card privacy">
          <div className="setting-card-icon">
            <Shield size={20} />
          </div>
          <div className="setting-card-content">
            <h3>您的数据保持私密</h3>
            <p>您的语音转录内容完全私密，数据零保留。它们仅存储在您的设备上，无法从其他地方访问。</p>
          </div>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="history-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="搜索历史记录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery("")}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="toolbar-actions">
          <button className="toolbar-btn" onClick={selectAll}>
            {selectedItems.size === filteredHistory.length && filteredHistory.length > 0 
              ? "取消全选" 
              : "全选"
            }
          </button>
        </div>
      </div>

      {/* 历史记录列表 */}
      <div className="history-list">
        {loading ? (
          <div className="history-empty">加载中...</div>
        ) : history.length === 0 ? (
          <div className="history-empty">
            <div className="empty-icon">
              <Calendar size={48} />
            </div>
            <p>暂无历史记录</p>
            <span>开始录音以创建您的第一条记录</span>
          </div>
        ) : groupedHistory.length === 0 ? (
          <div className="history-empty">
            <p>未找到匹配的记录</p>
          </div>
        ) : (
          groupedHistory.map(({ date, items }) => (
            <div key={date} className="history-group">
              <h3 className="history-date">{formatDate(date)}</h3>
              <div className="history-items">
                {items.map(item => (
                  <div 
                    key={item.id} 
                    className={`history-item ${selectedItems.has(item.id) ? "selected" : ""}`}
                    onClick={() => toggleSelect(item.id)}
                  >
                    <div className="item-checkbox">
                      <div className={`checkbox ${selectedItems.has(item.id) ? "checked" : ""}`}>
                        {selectedItems.has(item.id) && <span>✓</span>}
                      </div>
                    </div>
                    <div className="item-content">
                      <div className="item-time">{formatTime(item.timestamp)}</div>
                      <div className="item-text">{item.text}</div>
                    </div>
                    <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className={`item-action-btn ${copiedId === item.id ? "copied" : ""}`}
                        onClick={() => handleCopy(item.text, item.id)}
                        title="复制"
                      >
                        <Copy size={16} />
                      </button>
                      <button 
                        className="item-action-btn"
                        onClick={() => handleDelete(item.id)}
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>
              {selectedItems.size > 0 
                ? `确定要删除选中的 ${selectedItems.size} 条记录吗？` 
                : "确定要清空所有历史记录吗？此操作无法撤销。"
              }
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                取消
              </button>
              <button 
                className="btn-danger" 
                onClick={selectedItems.size > 0 ? handleDeleteSelected : handleClearAll}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistoryPage;
