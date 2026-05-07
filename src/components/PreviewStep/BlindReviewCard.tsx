import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { QualityReport } from '../../types';
import { scoreColor, gradeColor } from '../../services/blindReview';

const CATEGORY_LABELS: Record<string, string> = {
  visualQuality: 'Visual Quality',
  pacing: 'Pacing',
  narrativeClarity: 'Narrative Clarity',
  thumbnailEffectiveness: 'Thumbnail Effectiveness',
  overallProductionValue: 'Overall Production Value',
};

const SCORE_COLOR_CLASSES: Record<'red' | 'amber' | 'green', { text: string; bg: string }> = {
  red: { text: 'text-red-400', bg: 'bg-red-500' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-500' },
  green: { text: 'text-emerald-400', bg: 'bg-emerald-500' },
};

const GRADE_COLOR_CLASSES: Record<'red' | 'amber' | 'green', string> = {
  red: 'text-red-400',
  amber: 'text-amber-400',
  green: 'text-emerald-400',
};

interface BlindReviewCardProps {
  report: QualityReport | null;
}

export default function BlindReviewCard({ report }: BlindReviewCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!report) {
    return (
      <div className="border-2 border-surface-700 bg-surface-900 p-4" data-testid="blind-review-card">
        <p className="text-sm font-mono text-surface-400">
          No blind review available for this project.
        </p>
      </div>
    );
  }

  const gradeColorKey = gradeColor(report.letterGrade);
  const gradeTextClass = GRADE_COLOR_CLASSES[gradeColorKey];

  const categories = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

  return (
    <div className="border-2 border-surface-700 bg-surface-900 p-4" data-testid="blind-review-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-3xl font-bold font-mono ${gradeTextClass}`} data-testid="blind-review-grade">
            {report.letterGrade}
          </span>
          <div>
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-400">Blind Quality Review</p>
            <p className="text-xs font-mono text-surface-500">AI-evaluated as a real viewer</p>
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-1 border-2 border-surface-700 px-2 py-1 text-xs font-mono text-surface-400 hover:bg-brand-500 hover:text-black"
          aria-label={isCollapsed ? 'Expand review' : 'Collapse review'}
          data-testid="blind-review-toggle"
        >
          {isCollapsed ? 'Show' : 'Hide'}
          <ChevronDown className={`h-4 w-4 ${isCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4" data-testid="blind-review-details">
          <div className="space-y-3">
            {categories.map((category) => {
              const score = report.scores[category as keyof typeof report.scores];
              const feedback = report.feedback[category as keyof typeof report.feedback];
              const colorKey = scoreColor(score);
              const colorClasses = SCORE_COLOR_CLASSES[colorKey];
              const percentage = (score / 10) * 100;

              return (
                <div key={category} data-testid={`blind-review-category-${category}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-mono font-medium text-surface-300">{CATEGORY_LABELS[category]}</span>
                    <span className={`text-xs font-mono font-semibold ${colorClasses.text}`}>{score}/10</span>
                  </div>
                  <div className="h-1.5 overflow-hidden bg-surface-700">
                    <div
                      className={`h-full ${colorClasses.bg}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-surface-500">{feedback}</p>
                </div>
              );
            })}
          </div>

          <div className="border-2 border-surface-700 bg-surface-800 p-3">
            <p className="mb-1 text-xs font-mono font-semibold uppercase tracking-wider text-surface-400">Summary</p>
            <p className="text-sm leading-relaxed text-surface-300" data-testid="blind-review-summary">{report.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
