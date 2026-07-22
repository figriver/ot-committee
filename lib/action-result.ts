// How a server action says "no" to a user.
//
// Next REDACTS the message of anything thrown out of a server action in a
// production build — the client receives "An error occurred in the Server
// Components render. The specific message is omitted…". That is right for a
// crash (a stack trace or a DB error string is not the user's business) and
// wrong for a REFUSAL, where the message IS the product: "only the post's holder
// can edit this hat", "a note is required for a manual adjustment".
//
// So the two are split:
//
//   REFUSAL  — expected, explainable, the user can act on it → RETURN refuse(msg)
//   FAILURE  — a bug or an outage, nothing the user can do   → keep throwing
//
// Returning costs the caller one line (`if (r && !r.ok) setError(r.message)`)
// and nothing else; authorization is unaffected either way, since the action
// still refuses to do the work.
//
// CAVEAT — only for actions invoked from CLIENT components, which can await the
// result and render it. An action passed straight to `<form action={…}>` has
// nowhere to put a return value, so a refusal there must keep throwing (or the
// form needs useActionState). Each such action says so at its throw site.

// TWO WAYS TO REFUSE, depending on where the refusal is decided:
//
//   1. At the top of the action  → `return refuse('…')`. Plain and obvious.
//   2. Deep inside a lib it calls → `deny('…')` throws a Refusal, and the action
//      wraps its body in `guard(…)`, which turns a Refusal into a returned
//      result and rethrows everything else untouched. This is what lets a rule
//      enforced in lib/checklist.ts reach the user without every function in
//      the chain changing its return type.
//
// Anything that is NOT a Refusal keeps propagating and stays redacted, which is
// right: a Postgres error string is not a sentence for a committee member.

export type ActionResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/** The action refused, and this is the sentence to show the user. */
export const refuse = <T = void>(message: string): ActionResult<T> => ({
  ok: false,
  message,
});

/** The action did the work, handing back whatever the caller needs (an id, …). */
export const succeed = <T>(value: T): ActionResult<T> => ({ ok: true, value });

/** The action did the work and there is nothing to hand back. */
export const done: ActionResult = { ok: true, value: undefined };

/** A refusal in flight. Thrown by `deny`, caught by `guard`. */
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Refusal';
  }
}

/** Refuse from anywhere in the call stack, including a shared lib. */
export function deny(message: string): never {
  throw new Refusal(message);
}

/**
 * Run an action body, converting a Refusal into a returned result. Everything
 * else — a real bug, or Next's own redirect/notFound control-flow throws —
 * passes straight through.
 */
export async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return succeed(await fn());
  } catch (e) {
    if (e instanceof Refusal) return refuse(e.message);
    throw e;
  }
}

/** The message when a result is a refusal, else null — for client callers that
 *  funnel every action through one helper. */
export function refusalMessage(
  result: ActionResult<unknown> | void | undefined,
): string | null {
  return result && result.ok === false ? result.message : null;
}
