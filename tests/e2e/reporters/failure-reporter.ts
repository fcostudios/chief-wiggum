import fs from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface FailureRecord {
  test: string;
  file: string;
  error: string;
  screenshot?: string;
}

class FailureReporter implements Reporter {
  private failures: FailureRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;

    this.failures.push({
      test: test.titlePath().join(' > '),
      file: test.location.file,
      error: result.errors.map((error) => error.message ?? '').join('\n').trim(),
      screenshot: result.attachments.find((a) => a.name === 'screenshot')?.path,
    });
  }

  onEnd(result: FullResult): void {
    if (this.failures.length === 0) return;

    const output = {
      summary: `${this.failures.length} test(s) failed`,
      status: result.status,
      failures: this.failures,
    };

    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/failures.json', JSON.stringify(output, null, 2));

    console.log('\n--- E2E Failure Summary ---');
    for (const failure of this.failures) {
      console.log(`FAIL: ${failure.test}`);
      console.log(`File: ${failure.file}`);
      if (failure.screenshot) {
        console.log(`Screenshot: ${failure.screenshot}`);
      }
      console.log(`Error: ${failure.error.slice(0, 300)}`);
      console.log('');
    }
  }
}

export default FailureReporter;
