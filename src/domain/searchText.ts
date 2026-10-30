/** Shared normalization keeps local search consistent across knowledge views. */
export const normalizeSearchText = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
