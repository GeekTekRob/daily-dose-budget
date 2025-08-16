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
import crypto from 'crypto';

const salt = 'some-random-salt';
const secret = 'a-super-secret-key';

const hashPassword = (password) => {
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

const generateToken = (payload) => {
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const verifyToken = (token) => {
    try {
        const [encodedHeader, encodedPayload, signature] = token.split('.');
        const expectedSignature = crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64');
        if (signature !== expectedSignature) {
            return null;
        }
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
        return payload;
    } catch (e) {
        return null;
    }
}

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'authorization header required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'token required' });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'invalid token' });
    }

    req.user = payload;
    next();
}

export { hashPassword, generateToken, verifyToken, authenticate };