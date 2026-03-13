// ============================================================
// API Response Contracts
// Runtime validation for key route response payloads.
// ============================================================

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateChatResponse(payload) {
  const errors = [];
  if (!isObject(payload)) return ['payload must be an object'];
  if (payload.ok !== true) errors.push('ok must be true');
  if (typeof payload.response !== 'string') errors.push('response must be a string');
  if ('innerDialog' in payload && !isObject(payload.innerDialog)) {
    errors.push('innerDialog must be an object when present');
  }
  return errors;
}

function validateMemoriesReconstructResponse(payload) {
  const errors = [];
  if (!isObject(payload)) return ['payload must be an object'];
  if (payload.ok !== true) errors.push('ok must be true');
  if (typeof payload.reconstructed !== 'string') errors.push('reconstructed must be a string');
  return errors;
}

function validateDocumentIngestResponse(payload) {
  const errors = [];
  if (!isObject(payload)) return ['payload must be an object'];
  if (payload.ok !== true) errors.push('ok must be true');
  if (typeof payload.chunkId !== 'string' || !payload.chunkId) errors.push('chunkId must be a non-empty string');
  if (!Array.isArray(payload.topics)) errors.push('topics must be an array');
  if (typeof payload.importance !== 'number' || !Number.isFinite(payload.importance)) {
    errors.push('importance must be a finite number');
  }
  if (typeof payload.overwritten !== 'boolean') errors.push('overwritten must be a boolean');
  return errors;
}

const CONTRACT_VALIDATORS = {
  '/api/chat': validateChatResponse,
  '/api/memories/reconstruct': validateMemoriesReconstructResponse,
  '/api/document/ingest': validateDocumentIngestResponse
};

function enforceResponseContract(route, payload) {
  const validator = CONTRACT_VALIDATORS[route];
  if (typeof validator !== 'function') return payload;

  const errors = validator(payload);
  if (errors.length > 0) {
    const err = new Error(`Response contract violation for ${route}: ${errors.join('; ')}`);
    err.contractErrors = errors;
    throw err;
  }

  return payload;
}

module.exports = {
  enforceResponseContract,
  validateChatResponse,
  validateMemoriesReconstructResponse,
  validateDocumentIngestResponse
};
