import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'change-this-local-secret';

export function signToken(user) {
  return jwt.sign({ id: user.user_id, role: user.role }, SECRET, { expiresIn: '7d' });
}

/** Attaches req.user if a valid token is sent; never rejects. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), SECRET);
    } catch {
      /* ignore bad tokens on public routes */
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Log in to continue' });
    next();
  });
}

export function requireRole(...roles) {
  return (req, res, next) =>
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Your account type cannot do this' });
      }
      next();
    });
}
