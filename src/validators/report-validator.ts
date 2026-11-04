import Joi from "joi";
import { LOAN_TYPES } from "../config/loan-types";
import { isValidDateString } from "../utils/report-dates";
import { APPLICATION_STATUS_VALUES } from "./application-validator";

const dateField = Joi.string().custom((value: string, helpers) =>
  isValidDateString(value) ? value : helpers.error("any.invalid"),
).messages({ "any.invalid": "{{#label}} must be a real date written YYYY-MM-DD" });

/** Shared by the applications CSV: all optional, all only narrow the result. */
export const applicationsCsvQuerySchema = Joi.object({
  status: Joi.string().valid(...APPLICATION_STATUS_VALUES),
  productName: Joi.string().valid(...LOAN_TYPES),
  from: dateField,
  to: dateField,
}).custom((value: { from?: string; to?: string }, helpers) =>
  value.from && value.to && value.from > value.to ? helpers.message({ custom: '"from" must not be after "to"' }) : value,
);

/** Monthly summary: optional date window on creation date (Lagos days, both ends inclusive). */
export const summaryQuerySchema = Joi.object({
  from: dateField,
  to: dateField,
}).custom((value: { from?: string; to?: string }, helpers) =>
  value.from && value.to && value.from > value.to ? helpers.message({ custom: '"from" must not be after "to"' }) : value,
);
