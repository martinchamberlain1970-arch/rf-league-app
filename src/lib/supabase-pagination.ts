type SupabasePageError = {
  message: string;
};

type SupabasePage<T> = {
  data: T[] | null;
  error: SupabasePageError | null;
};

/**
 * Reads every row from a deliberately scoped Supabase query.
 *
 * The callback must apply a stable, unique ordering before `range()` is added.
 * Keeping pagination here avoids silent truncation at the project's API row cap.
 */
export async function fetchAllSupabasePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
  pageSize = 500
): Promise<SupabasePage<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data: null, error: page.error };

    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return { data: rows, error: null };
  }
}

/**
 * Applies the same safe pagination to bounded `in(...)` filters without creating
 * an oversized request URL when the list of identifiers grows over time.
 */
export async function fetchAllSupabasePagesByChunks<T, TValue>(
  values: TValue[],
  fetchPage: (chunk: TValue[], from: number, to: number) => PromiseLike<SupabasePage<T>>,
  options: { chunkSize?: number; pageSize?: number } = {}
): Promise<SupabasePage<T>> {
  const chunkSize = options.chunkSize ?? 100;
  const pageSize = options.pageSize ?? 500;
  const rows: T[] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize);
    const result = await fetchAllSupabasePages<T>(
      (from, to) => fetchPage(chunk, from, to),
      pageSize
    );
    if (result.error) return result;
    rows.push(...(result.data ?? []));
  }

  return { data: rows, error: null };
}
