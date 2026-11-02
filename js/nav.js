// Remembers where a form (time entry, contact, study note) should return to, so opening one from
// the Calendar or Home and saving brings you back there instead of to a fixed screen.

let returnTo = null;

export const setReturn = (hash) => { returnTo = hash; };
export const clearReturn = () => { returnTo = null; };
export const returnHash = (fallback) => returnTo || fallback;

export function goBack(fallback) {
  const target = returnHash(fallback);
  returnTo = null;
  location.hash = target;
}

// Click handler for links that open a form: remember where they were opened from.
export const opens = (hash) => () => setReturn(hash);
