import { Request, Response } from "express";
import { catchAsync } from "../middleware/catch-async";
import * as reportService from "../services/report-service";

interface WindowQuery {
  from?: string;
  to?: string;
}

export const applicationsCsvController = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as unknown as WindowQuery & { status?: string; productName?: string };
  const { csv, truncated } = await reportService.applicationsCsv(query);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="lats-applications-${stamp}.csv"`);
  // Lets the frontend warn "showing the first 10,000" without parsing the file.
  res.setHeader("X-Report-Truncated", truncated ? "true" : "false");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Report-Truncated");
  res.status(200).send(csv);
});

export const summaryController = catchAsync(async (req: Request, res: Response) => {
  res.status(200).json(await reportService.monthlySummary(req.query as unknown as WindowQuery));
});

export const pipelineController = catchAsync(async (_req: Request, res: Response) => {
  res.status(200).json(await reportService.pipeline());
});

export const casePdfController = catchAsync(async (req: Request, res: Response) => {
  const { filename, pdf } = await reportService.casePdf(req.user!, req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.status(200).send(pdf);
});
