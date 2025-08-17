const validate = (schema) => (req, res, next) => {
  const errors = [];
  for (const key in schema) {
    if (schema.hasOwnProperty(key)) {
      const rule = schema[key];
      const value = req.body[key];
      if (value !== undefined) { // Only validate if the field is present in the request
        const result = rule.validate(value);
        if (result.error) {
          errors.push(`'${key}' ${result.error}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  next();
};

const string = (required = true) => ({
  validate: (value) => {
    if (typeof value !== 'string') {
      return { error: 'must be a string' };
    }
    if (required && value.trim().length === 0) {
      return { error: 'is required' };
    }
    return { value };
  },
});

const number = (required = true) => ({
    validate: (value) => {
        if (typeof value !== 'number') {
            return { error: 'must be a number' };
        }
        if (required && value === undefined) {
            return { error: 'is required' };
        }
        return { value };
    }
})

const bool = (required = true) => ({
    validate: (value) => {
        if (typeof value !== 'boolean') {
            return { error: 'must be a boolean' };
        }
        if (required && value === undefined) {
            return { error: 'is required' };
        }
        return { value };
    }
})

const accountSchema = {
  name: string(),
  displayName: string(),
  initialBalance: number(),
  type: string()
};

const updateAccountSchema = {
  name: string(false),
  displayName: string(false),
  type: string(false),
  balanceResetDate: string(false),
  balanceResetAmount: number(false)
};

const transactionSchema = {
    accountId: number(),
    date: string(),
    amount: number(),
    type: string(),
    status: string(),
    description: string()
}

const updateTransactionSchema = {
    accountId: number(false),
    date: string(false),
    amount: number(false),
    type: string(false),
    status: string(false),
    description: string(false)
}

const billSchema = {
    name: string(),
    amount: number(),
    startDate: string(),
    isRecurring: bool(),
    recurringType: string()
}

const paycheckSchema = {
    name: string(),
    amount: number(),
    startDate: string(),
    isRecurring: bool(),
    recurringType: string()
}

const recurringSchema = {
    name: string(),
    type: string(),
    estimatedAmount: number(),
    startDate: string(),
    isRecurring: bool(),
    recurringType: string()
}

const updateRecurringSchema = {
    name: string(false),
    type: string(false),
    estimatedAmount: number(false),
    startDate: string(false),
    isRecurring: bool(false),
    recurringType: string(false),
    archived: bool(false)
}

const confirmRecurringSchema = {
    date: string(),
    amount: number(),
    accountId: number(),
    description: string()
}

export { validate, accountSchema, updateAccountSchema, transactionSchema, updateTransactionSchema, billSchema, paycheckSchema, recurringSchema, updateRecurringSchema, confirmRecurringSchema };