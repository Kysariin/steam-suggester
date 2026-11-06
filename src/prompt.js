// Tiny line-based prompt helper. Works when typing, and when answers are piped in all at once.
import { createInterface } from "node:readline";

export function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const queued = [];
  let waiter = null;
  let closed = false;
  rl.on("line", (line) => (waiter ? (waiter(line), (waiter = null)) : queued.push(line)));
  rl.on("close", () => {
    closed = true;
    waiter?.(null);
  });

  /** Resolves to the trimmed answer, or null if input ended. */
  function ask(question) {
    process.stdout.write(question);
    if (queued.length) {
      const line = queued.shift();
      if (!process.stdin.isTTY) process.stdout.write(line + "\n");
      return Promise.resolve(line.trim());
    }
    if (closed) {
      process.stdout.write("\n");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      waiter = (line) => resolve(line === null ? null : line.trim());
    });
  }

  /** Numbered menu over an object's entries; returns the chosen key. */
  async function choose(question, options, defaultKey) {
    const keys = Object.keys(options);
    console.log(question);
    keys.forEach((k, i) => console.log(`  ${String(i + 1).padStart(2)}. ${options[k].label}`));
    for (;;) {
      const d = defaultKey ? ` [${keys.indexOf(defaultKey) + 1}]` : "";
      const a = await ask(`> ${d ? d.trim() + " " : ""}`);
      if (a === null) return defaultKey ?? keys[0];
      if (!a && defaultKey) return defaultKey;
      const n = Number(a);
      if (Number.isInteger(n) && n >= 1 && n <= keys.length) return keys[n - 1];
      const byName = keys.find((k) => k === a.toLowerCase());
      if (byName) return byName;
      console.log(`  Enter a number from 1 to ${keys.length}.`);
    }
  }

  return { ask, choose, close: () => rl.close() };
}

export const style = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
