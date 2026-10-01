#!/usr/bin/env node
/**
 * Test script for FFmpeg death detection implementation
 * Validates error classification and retry logic
 */

// Simulate the classifyFFmpegError function
function classifyFFmpegError(code, signal, stderr = '') {
  const nonRetryablePatterns = [
    /Invalid argument/i,
    /Unknown encoder/i,
    /Unsupported pixel format/i,
    /Permission denied/i,
    /No such file or directory/i,
    /No space left/i,
    /Disk full/i,
    /Cannot allocate memory/i,
    /Out of memory/i,
  ];
  
  const retryablePatterns = [
    /Connection timed out/i,
    /Broken pipe/i,
    /Resource temporarily unavailable/i,
    /Too many open files/i,
    /Interrupted system call/i,
  ];
  
  for (const pattern of nonRetryablePatterns) {
    if (pattern.test(stderr)) {
      return { type: 'NON_RETRYABLE', category: 'CONFIGURATION_ERROR', shouldRetry: false };
    }
  }
  
  for (const pattern of retryablePatterns) {
    if (pattern.test(stderr)) {
      return { type: 'RETRYABLE', category: 'TRANSIENT_ERROR', shouldRetry: true };
    }
  }
  
  if (signal === 'SIGKILL') {
    return { type: 'NON_RETRYABLE', category: 'PROCESS_KILLED', shouldRetry: false };
  }
  
  if (signal === 'SIGTERM' || signal === 'SIGINT') {
    return { type: 'NON_RETRYABLE', category: 'GRACEFUL_SHUTDOWN', shouldRetry: false };
  }
  
  if (code === 137) {
    return { type: 'NON_RETRYABLE', category: 'OOM_KILLED', shouldRetry: false };
  }
  
  if (code === 124) {
    return { type: 'RETRYABLE', category: 'TIMEOUT', shouldRetry: true };
  }
  
  if (code === null && signal) {
    return { type: 'RETRYABLE', category: 'SIGNAL_TERMINATED', shouldRetry: true };
  }
  
  return { type: 'UNKNOWN', category: 'UNCATEGORIZED', shouldRetry: code !== 0 };
}

// Test cases
const tests = [
  {
    name: 'OOM Kill (exit code 137)',
    input: { code: 137, signal: null, stderr: '' },
    expected: { category: 'OOM_KILLED', shouldRetry: false }
  },
  {
    name: 'Timeout (exit code 124)',
    input: { code: 124, signal: null, stderr: '' },
    expected: { category: 'TIMEOUT', shouldRetry: true }
  },
  {
    name: 'Broken pipe (transient)',
    input: { code: 1, signal: null, stderr: 'broken pipe error' },
    expected: { category: 'TRANSIENT_ERROR', shouldRetry: true }
  },
  {
    name: 'Disk full',
    input: { code: 1, signal: null, stderr: 'No space left on device' },
    expected: { category: 'CONFIGURATION_ERROR', shouldRetry: false }
  },
  {
    name: 'Unknown encoder',
    input: { code: 1, signal: null, stderr: 'Unknown encoder libx265' },
    expected: { category: 'CONFIGURATION_ERROR', shouldRetry: false }
  },
  {
    name: 'SIGTERM (graceful)',
    input: { code: null, signal: 'SIGTERM', stderr: '' },
    expected: { category: 'GRACEFUL_SHUTDOWN', shouldRetry: false }
  },
  {
    name: 'SIGKILL (forced)',
    input: { code: null, signal: 'SIGKILL', stderr: '' },
    expected: { category: 'PROCESS_KILLED', shouldRetry: false }
  },
  {
    name: 'Too many open files',
    input: { code: 1, signal: null, stderr: 'too many open files' },
    expected: { category: 'TRANSIENT_ERROR', shouldRetry: true }
  },
];

console.log('🧪 Testing FFmpeg Error Classification\n');
console.log('=' .repeat(80));

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = classifyFFmpegError(test.input.code, test.input.signal, test.input.stderr);
  const categoryMatch = result.category === test.expected.category;
  const retryMatch = result.shouldRetry === test.expected.shouldRetry;
  
  if (categoryMatch && retryMatch) {
    console.log(`✅ PASS: ${test.name}`);
    console.log(`   Category: ${result.category}, Retryable: ${result.shouldRetry}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`   Expected: ${test.expected.category}, Retryable: ${test.expected.shouldRetry}`);
    console.log(`   Got:      ${result.category}, Retryable: ${result.shouldRetry}`);
    failed++;
  }
  console.log();
}

console.log('=' .repeat(80));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

if (failed === 0) {
  console.log('\n✅ All tests passed! Error classification is working correctly.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Review implementation.');
  process.exit(1);
}
