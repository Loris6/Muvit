// cross-fetch → eingebautes fetch des Workers
const f = (...a) => globalThis.fetch(...a);
export default f;
export { f as fetch };
export const Headers = globalThis.Headers, Request = globalThis.Request, Response = globalThis.Response;
