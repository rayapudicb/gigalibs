export class CsvExporter {
  static exportToCsv<T extends Record<string, any>>(
    data: T[],
    columns: Array<{ key: keyof T; header: string }>,
  ): string {
    if (data.length === 0) return '';

    const headerRow = columns.map((c) => `"${c.header}"`).join(',');
    const bodyRows = data.map((item) =>
      columns
        .map((c) => {
          const val = item[c.key];
          const sanitized = val === null || val === undefined ? '' : String(val).replace(/"/g, '""');
          return `"${sanitized}"`;
        })
        .join(','),
    );

    return [headerRow, ...bodyRows].join('\n');
  }
}
