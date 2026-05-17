export var STORAGE_KEY_PREFIX = 'premium_auth_status_v1_';
export var MAX_ATTEMPTS = 3;
export var ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCode(code) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(code);
}

export function toSortedObject(obj) {
  return Object.keys(obj).sort().reduce(function(acc, key) {
    acc[key] = obj[key];
    return acc;
  }, {});
}
