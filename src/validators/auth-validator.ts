import Joi from "joi";

export const loginSchema = Joi.object({
  // { tlds: { allow: false } } disables Joi's public-TLD-registry check —
  // without it, addresses on reserved testing TLDs like .test (RFC 2606,
  // used by our own seed data: sales@lats.test etc.) are wrongly rejected
  // as invalid. Real-world TLDs are still required to look like TLDs
  // (e.g. "user@host" with no dot still fails); only the registry lookup
  // is skipped.
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required(),
});
