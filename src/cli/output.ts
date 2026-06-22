export interface CliResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}
