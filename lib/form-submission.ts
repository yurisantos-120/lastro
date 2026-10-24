export class FormSubmissionError extends Error {
  readonly status: number;
  readonly uncertain: boolean;
  readonly code: string;
  constructor(message: string, status: number, uncertain = false, code = '') {
    super(message);
    this.name = 'FormSubmissionError';
    this.status = status;
    this.uncertain = uncertain;
    this.code = code;
  }
}

// A synchronous gate protects even two submits before React renders pending.
// Unknown outcomes must be reviewed, never silently replayed as new creates.
export class SubmissionGate {
  pending = false;
  uncertain = false;
  resumeSameIntention() { if (!this.pending) this.uncertain = false; }

  async run(action: () => Promise<void>) {
    if (this.pending || this.uncertain) return { state: 'ignored' as const };
    this.pending = true;
    try {
      await action();
      return { state: 'saved' as const };
    } catch (error) {
      this.uncertain = !(error instanceof FormSubmissionError) || error.uncertain;
      return { state: 'error' as const, error, uncertain: this.uncertain };
    } finally {
      this.pending = false;
    }
  }
}
