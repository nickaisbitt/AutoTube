import { useState, KeyboardEvent } from 'react';
import { X, Tag } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function TagInput({ tags, onChange, placeholder = 'Add tags...' }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const parts = input.split(/[,]/).map(s => s.trim()).filter(Boolean);
      parts.forEach(addTag);
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-mono font-medium uppercase tracking-wider text-surface-300">
        <Tag className="h-4 w-4" />
        Tags
      </label>
      <div className="flex flex-wrap gap-2 p-2 border-2 border-surface-700 bg-surface-800 min-h-[42px]">
        {tags.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-brand-500/20 text-brand-400 border border-brand-500/30"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-white"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) {
              addTag(input);
              setInput('');
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm font-mono text-white placeholder-surface-500 focus:outline-none"
        />
      </div>
      <p className="text-[10px] font-mono text-surface-500">
        Press Enter or comma to add multiple tags
      </p>
    </div>
  );
}
