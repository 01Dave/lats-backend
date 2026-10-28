import { Request, Response } from "express";
import { LOAN_TYPES } from "../config/loan-types";

// Static reference data for the frontend — the approved loan types for the
// dropdown. Served from config (code), not the database, on purpose.
export function listLoanTypesController(_req: Request, res: Response): void {
  res.status(200).json({ data: LOAN_TYPES });
}
