import validator from 'validator';

export function isValidUrl(string) {
  if (!(string instanceof String)) return false;
  return validator.isURL(string, {
    require_protocol: true,
    require_tld: true,
  });
}
