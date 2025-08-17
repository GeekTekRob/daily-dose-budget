const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'invalid token' });
    }

    res.status(500).json({ error: 'Something went wrong' });
};

export { errorHandler };