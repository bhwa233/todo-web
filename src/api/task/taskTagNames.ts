// Task tag names are compared without surrounding whitespace or letter case.
export function normalizeTaskTagNames(names: string[]): string[] {
  const unique = new Map<string, string>();
  for (const input of names) {
    const name = input.trim();
    if (name && !unique.has(name.toLocaleLowerCase()))
      unique.set(name.toLocaleLowerCase(), name);
  }
  return [...unique.values()];
}
