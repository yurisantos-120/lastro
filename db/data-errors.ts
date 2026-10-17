export type DataStorageErrorCode = 'CATEGORY_NOT_FOUND' | 'CATEGORY_SCOPE_MISMATCH' | 'CATEGORY_SCOPE_CONFLICT' | 'RECORD_NOT_FOUND' | 'CATEGORY_NOT_FOUND_FOR_UPDATE' | 'REVISION_CONFLICT' | 'INSERT_FAILED' | 'UPDATE_FAILED';

export class DataStorageError extends Error {
  readonly code: DataStorageErrorCode;

  constructor(code: DataStorageErrorCode) {
    super(code);
    this.name = 'DataStorageError';
    this.code = code;
  }
}
