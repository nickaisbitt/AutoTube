import { useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { addComment, getComments, deleteComment, type Comment } from '../services/collaboration';

interface CommentsPanelProps {
  segmentId: string;
  segmentTitle: string;
}

export default function CommentsPanel({ segmentId, segmentTitle }: CommentsPanelProps) {
  const [text, setText] = useState('');
  const [comments, setComments] = useState<Comment[]>(() => getComments(segmentId));

  const handleAdd = () => {
    const comment = addComment(segmentId, text);
    if (comment) {
      setComments(getComments(segmentId));
      setText('');
    }
  };

  const handleDelete = (commentId: string) => {
    deleteComment(segmentId, commentId);
    setComments(getComments(segmentId));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="border-2 border-surface-700 bg-surface-900">
      <div className="flex items-center gap-2 border-b-2 border-surface-700 px-3 py-2">
        <MessageSquare className="h-4 w-4 text-brand-500" />
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-300">
          Comments - {segmentTitle}
        </span>
        <span className="ml-auto text-[10px] font-mono text-surface-500">
          {comments.length}
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto p-3 space-y-2">
        {comments.length === 0 && (
          <p className="text-xs font-mono text-surface-500">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="group rounded border border-surface-700 bg-surface-950 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold text-brand-400">{c.author}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-surface-500">
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-opacity"
                  aria-label="Delete comment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs font-mono text-surface-300">{c.text}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t-2 border-surface-700 p-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment..."
          className="flex-1 border-2 border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className="flex items-center gap-1 bg-brand-500 px-2 py-1 text-xs font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send comment"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
