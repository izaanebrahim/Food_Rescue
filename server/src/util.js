/** Wrap an async route so thrown errors reach the error handler. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Turn MySQL errors into clean API responses. */
export function errorHandler(err, _req, res, _next) {
  // SIGNAL SQLSTATE '45000' from our triggers and procedures: a rule was broken.
  if (err.sqlState === '45000') {
    return res.status(400).json({ error: err.sqlMessage });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    const field = /uq_users_email/.test(err.sqlMessage) ? 'email'
      : /uq_users_phone/.test(err.sqlMessage) ? 'phone number'
      : /uq_feedback_claim/.test(err.sqlMessage) ? 'feedback'
      : /uq_claims_one_active/.test(err.sqlMessage) ? 'claim' : 'record';
    const msg = field === 'claim' ? 'Someone else has already claimed this food'
      : field === 'feedback' ? 'You already left feedback for this pickup'
      : `An account with this ${field} already exists`;
    return res.status(409).json({ error: msg });
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    const name = (err.sqlMessage.match(/'([^']+)'/) || [])[1] || '';
    const friendly = {
      chk_users_phone: 'Enter the phone number with country code, digits only (for example 919876543210)',
      chk_users_email: 'Enter a valid email address',
      chk_users_org: 'NGOs must give their organisation name',
      chk_listing_qty: 'Servings must be between 1 and 5000',
      chk_listing_window: 'Safe-until time must be after the prepared time',
      chk_listing_shelf: 'Listings can cover at most 72 hours',
      chk_feedback_rating: 'Rating must be 1 to 5',
    };
    return res.status(400).json({ error: friendly[name] || `Invalid value (${name})` });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is larger than 5 MB' });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Check the server console.' });
}
