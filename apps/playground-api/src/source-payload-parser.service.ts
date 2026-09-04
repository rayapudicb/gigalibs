import { Injectable } from '@nestjs/common';
import { ConnectorFailure } from './connector-errors.js';

@Injectable()
export class SourcePayloadParserService {
  parse(
    input: Buffer | string,
    contentType: 'application/json' | 'text/csv',
    csvDelimiter = ',',
  ): unknown {
    const text = typeof input === 'string' ? input : input.toString('utf8');
    try {
      return contentType === 'application/json' ? JSON.parse(text) : this.parseCsv(text, csvDelimiter);
    } catch (error) {
      if (error instanceof ConnectorFailure) throw error;
      throw new ConnectorFailure(
        'INVALID_SOURCE_PAYLOAD',
        error instanceof Error ? error.message : 'The source payload could not be parsed.',
      );
    }
  }

  private parseCsv(input: string, delimiter: string): Array<Record<string, string>> {
    if (delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
      throw new ConnectorFailure('CSV_DELIMITER_INVALID', 'The configured CSV delimiter is invalid.');
    }
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (quoted) {
        if (character === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === delimiter) {
        row.push(field);
        field = '';
      } else if (character === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else field += character;
    }
    if (quoted) {
      throw new ConnectorFailure(
        'INVALID_SOURCE_PAYLOAD',
        'CSV contains an unterminated quoted field.',
      );
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }
    const header = rows.shift()?.map((cell) => cell.trim()) ?? [];
    if (header.length === 0 || header.some((cell) => !cell) || new Set(header).size !== header.length) {
      throw new ConnectorFailure(
        'INVALID_SOURCE_PAYLOAD',
        'CSV requires a non-empty, unique header row.',
      );
    }
    return rows
      .filter((cells) => cells.some((cell) => cell.length > 0))
      .map((cells) => {
        if (cells.length > header.length) {
          throw new ConnectorFailure(
            'INVALID_SOURCE_PAYLOAD',
            'A CSV record contains more values than the header row.',
          );
        }
        return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? '']));
      });
  }
}
