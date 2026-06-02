type Fields = Record<string, unknown>;

function emit(level: string, msg: string, fields: Fields): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }));
}

export const logger = {
  info: (msg: string, fields: Fields = {}) => emit('info', msg, fields),
  warn: (msg: string, fields: Fields = {}) => emit('warn', msg, fields),
  error: (msg: string, fields: Fields = {}) => emit('error', msg, fields),
};
