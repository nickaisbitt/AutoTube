export interface A11yIssue {
  id: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  rule: string;
  message: string;
  element?: string;
}

export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

export function checkA11y(): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (typeof document === 'undefined') return issues;

  // Check interactive elements for accessible names
  const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [role="link"]';
  const interactiveElements = document.querySelectorAll(interactiveSelectors);

  interactiveElements.forEach((el, idx) => {
    const hasAriaLabel = el.hasAttribute('aria-label');
    const hasAriaLabelledBy = el.hasAttribute('aria-labelledby');
    const hasTitle = el.hasAttribute('title');
    const hasText = el.textContent?.trim();
    const isImg = el.tagName.toLowerCase() === 'img';
    const hasAlt = isImg && el.hasAttribute('alt');

    if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle && !hasText && !hasAlt) {
      issues.push({
        id: `a11y-interactive-${idx}`,
        severity: 'serious',
        rule: 'interactive-label',
        message: `Interactive element <${el.tagName.toLowerCase()}> has no accessible name`,
        element: el.outerHTML.substring(0, 120),
      });
    }
  });

  // Check for skip-to-content link
  const skipLink = document.querySelector('[href="#main-content"], [href="#main"], a.skip-link');
  if (!skipLink) {
    issues.push({
      id: 'a11y-skip-link',
      severity: 'moderate',
      rule: 'skip-link',
      message: 'No "Skip to Content" link found for keyboard/screen reader users',
    });
  }

  // Check focus visibility
  const styleSheets = document.styleSheets;
  let hasFocusStyle = false;
  try {
    for (const sheet of Array.from(styleSheets)) {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule instanceof CSSStyleRule && rule.selectorText?.includes(':focus')) {
          hasFocusStyle = true;
          break;
        }
      }
      if (hasFocusStyle) break;
    }
  } catch {
    // cross-origin stylesheets throw
  }

  if (!hasFocusStyle) {
    issues.push({
      id: 'a11y-focus-visible',
      severity: 'serious',
      rule: 'focus-visible',
      message: 'No visible focus indicator styles detected',
    });
  }

  // Check for lang attribute on html
  const htmlEl = document.documentElement;
  if (!htmlEl.hasAttribute('lang')) {
    issues.push({
      id: 'a11y-lang',
      severity: 'moderate',
      rule: 'html-lang',
      message: '<html> element is missing a lang attribute',
    });
  }

  // Check for duplicate IDs
  const allIds = new Set<string>();
  const elementsWithId = document.querySelectorAll('[id]');
  elementsWithId.forEach(el => {
    const id = el.getAttribute('id');
    if (id) {
      if (allIds.has(id)) {
        issues.push({
          id: `a11y-duplicate-${id}`,
          severity: 'moderate',
          rule: 'duplicate-id',
          message: `Duplicate id "${id}" found`,
        });
      }
      allIds.add(id);
    }
  });

  // Check images without alt
  const images = document.querySelectorAll('img:not([alt])');
  images.forEach((img, idx) => {
    issues.push({
      id: `a11y-img-alt-${idx}`,
      severity: 'serious',
      rule: 'img-alt',
      message: 'Image is missing alt attribute',
      element: (img as HTMLImageElement).src.substring(0, 100),
    });
  });

  // Check form inputs for labels
  const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
  inputs.forEach((input, idx) => {
    const id = input.getAttribute('id');
    const hasLabel = id && document.querySelector(`label[for="${id}"]`);
    const hasAriaLabel = input.hasAttribute('aria-label');
    const hasAriaLabelledBy = input.hasAttribute('aria-labelledby');
    const hasTitle = input.hasAttribute('title');
    const hasPlaceholder = input.hasAttribute('placeholder');

    if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle && !hasPlaceholder) {
      issues.push({
        id: `a11y-form-label-${idx}`,
        severity: 'serious',
        rule: 'form-label',
        message: `Form element <${input.tagName.toLowerCase()}> has no associated label`,
      });
    }
  });

  return issues;
}

export function reportA11yIssues(): A11yIssue[] {
  const issues = checkA11y();
  issues.sort((a, b) => {
    const severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  return issues;
}

export function printA11yReport(): void {
  const issues = reportA11yIssues();
  if (issues.length === 0) {
    console.log('[a11y] No issues found.');
    return;
  }

  console.log(`\n=== Accessibility Report (${issues.length} issues) ===\n`);
  for (const issue of issues) {
    const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'serious' ? '🟠' : issue.severity === 'moderate' ? '🟡' : '⚪';
    console.log(`${icon} [${issue.severity.toUpperCase()}] ${issue.rule}: ${issue.message}`);
    if (issue.element) {
      console.log(`   Element: ${issue.element}`);
    }
  }
  console.log('');
}
