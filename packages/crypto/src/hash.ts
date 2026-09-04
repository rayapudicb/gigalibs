import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { bytesToHex } from './random-bytes.js';

export const sha256Bytes = (input: string): Uint8Array => nobleSha256(utf8ToBytes(input));

export const sha256 = (input: string): string => bytesToHex(sha256Bytes(input));
