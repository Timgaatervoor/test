/**
 * Pure business and timing logic for SafeConfirm interactions.
 * Independent of DOM for testability in Node.js and headless environments.
 */

export interface HoldProgressState {
  progress: number; // 0.0 to 1.0
  remainingSeconds: number;
  isCompleted: boolean;
}

export function calculateHoldProgress(
  elapsedMs: number,
  totalDurationSeconds: number
): HoldProgressState {
  const totalMs = Math.max(100, totalDurationSeconds * 1000);
  const safeElapsed = Math.max(0, elapsedMs);
  const progress = Math.min(1, safeElapsed / totalMs);
  const remainingMs = Math.max(0, totalMs - safeElapsed);
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const isCompleted = progress >= 1;

  return {
    progress: Number(progress.toFixed(4)),
    remainingSeconds,
    isCompleted,
  };
}

export function validateTypeConfirmation(
  userInput: string,
  requiredKeyword = 'BEVESTIG'
): boolean {
  if (!userInput || !requiredKeyword) return false;
  return userInput.trim().toUpperCase() === requiredKeyword.trim().toUpperCase();
}

export function isValidDoubleClick(
  firstClickTimestamp: number,
  secondClickTimestamp: number,
  maxWindowMs = 3500
): boolean {
  const diff = secondClickTimestamp - firstClickTimestamp;
  return diff > 50 && diff <= maxWindowMs;
}
