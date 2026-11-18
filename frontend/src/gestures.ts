// Tuning numbers for gesture detection.
const MIN_SCORE = 0.6;
const FRAMES_FAST = 3;
const FRAMES_SLOW = 6;
const COOLDOWN_MS = 1500;

// Accepts a gesture only after it has been steady for a few frames, and
// reports each gesture once when it begins, then waits out a cooldown.
export function createGestureTracker() {
  let candidate = "None";
  let count = 0;
  let stable = "None";
  const lastFired: Record<string, number> = {};

  function update(name: string, score: number, now: number) {
    const seen = score >= MIN_SCORE ? name : "None";
    if (seen === candidate) {
      count++;
    } else {
      candidate = seen;
      count = 1;
    }

    const needed = seen === "Closed_Fist" || seen === "None" ? FRAMES_FAST : FRAMES_SLOW;
    let entered: string | null = null;

    if (count >= needed && candidate !== stable) {
      stable = candidate;
      const last = lastFired[stable] ?? -COOLDOWN_MS;
      if (stable !== "None" && now - last >= COOLDOWN_MS) {
        lastFired[stable] = now;
        entered = stable;
      }
    }

    return { stable, entered };
  }

  function reset() {
    candidate = "None";
    count = 0;
    stable = "None";
  }

  return { update, reset };
}
