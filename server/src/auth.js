import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// In production, keep these in env vars
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const hashPassword = (password) => {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
}

const comparePassword = (password, hash) => bcrypt.compareSync(password, hash);

const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'authorization header required' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'token required' });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'invalid token' });
    // Attach minimal user info
    req.user = { id: payload.id, username: payload.username };
    next();
}

export { hashPassword, comparePassword, generateToken, verifyToken, authenticate };