// AI: This file was generated with AI assistance for Sprint 5 structured logging. See AI-DISCLOSURE.md and ai/chats/2026-08-10-231436-sprint-5-json-logging.jsonl.
const createLogger = (service) => {
  const log = (level, message, fields = {}) => {
    const entry = {
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      message,
      service,
    };

    const output = `${JSON.stringify(entry)}\n`;
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(output);
  };

  return log;
};

export { createLogger };
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-10-231436-sprint-5-json-logging.jsonl.
