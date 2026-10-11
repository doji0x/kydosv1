/** HTTP metadata attached to a UI request failure; no global Error augmentation. */
export class RequestError extends Error {
  /** @param {string} message
   * @param {{ status?: number; retryAfter?: number }} [details] */
  constructor(message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
/** @param {unknown} error */
export function requestStatus(error) {
  return error instanceof RequestError ? error.status : undefined;
}
/** @param {unknown} error */
export function requestRetryAfter(error) {
  return error instanceof RequestError ? error.retryAfter : undefined;
}
