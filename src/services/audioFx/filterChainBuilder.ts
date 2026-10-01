export interface AudioFilter {
  name: string;
  params: Record<string, string | number>;
  enable?: { start: number; end: number };
}

export class FilterChainBuilder {
  private filters: AudioFilter[] = [];

  addFilter(filter: AudioFilter): FilterChainBuilder {
    this.filters.push(filter);
    return this;
  }

  addEQ(frequency: number, gain: number, q: number = 1.0): FilterChainBuilder {
    return this.addFilter({
      name: 'equalizer',
      params: { f: frequency, g: gain, width_type: 'q', w: q },
    });
  }

  addCompression(threshold: number, ratio: number, attack: number = 5, release: number = 50): FilterChainBuilder {
    return this.addFilter({
      name: 'acompressor',
      params: { threshold: `${threshold}dB`, ratio, attack, release },
    });
  }

  addLimiter(ceiling: number): FilterChainBuilder {
    return this.addFilter({
      name: 'alimiter',
      params: { limit: `${ceiling}dB` },
    });
  }

  addFadeIn(duration: number): FilterChainBuilder {
    return this.addFilter({
      name: 'afade',
      params: { t: 'in', st: 0, d: duration, curve: 'exp' },
    });
  }

  addFadeOut(duration: number, startTime: number): FilterChainBuilder {
    return this.addFilter({
      name: 'afade',
      params: { t: 'out', st: startTime, d: duration, curve: 'exp' },
    });
  }

  addVolume(volume: number, start?: number, end?: number): FilterChainBuilder {
    const filter: AudioFilter = {
      name: 'volume',
      params: { volume },
    };
    if (start !== undefined && end !== undefined) {
      filter.enable = { start, end };
    }
    return this.addFilter(filter);
  }

  build(): string {
    if (this.filters.length === 0) return '';

    const parts: string[] = [];

    for (const f of this.filters) {
      const paramStr = Object.entries(f.params)
        .map(([k, v]) => `${k}=${v}`)
        .join(':');

      let filterStr = `${f.name}=${paramStr}`;

      if (f.enable) {
        filterStr += `:enable='between(t,${f.enable.start.toFixed(3)},${f.enable.end.toFixed(3)})'`;
      }

      parts.push(filterStr);
    }

    return parts.join(',');
  }

  toCommandArgs(inputFile: string, outputFile: string): string[] {
    const filterStr = this.build();
    if (!filterStr) {
      return ['-y', '-i', inputFile, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', outputFile];
    }
    return [
      '-y',
      '-i', inputFile,
      '-af', filterStr,
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      outputFile,
    ];
  }
}
