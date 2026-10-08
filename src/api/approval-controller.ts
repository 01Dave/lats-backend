import { Request, Response } from "express";
import { catchAsync } from "../middleware/catch-async";
import * as approvalService from "../services/approval-service";

export const hodDecisionController = catchAsync(async (req: Request, res: Response) => {
  const application = await approvalService.hodDecision(req.user!, req.params.id, req.body);
  res.status(200).json(application);
});

export const creditDecisionController = catchAsync(async (req: Request, res: Response) => {
  const application = await approvalService.creditDecision(req.user!, req.params.id, req.body);
  res.status(200).json(application);
});

export const internalControlDecisionController = catchAsync(async (req: Request, res: Response) => {
  const application = await approvalService.internalControlDecision(req.user!, req.params.id, req.body);
  res.status(200).json(application);
});

export const mdDecisionController = catchAsync(async (req: Request, res: Response) => {
  const application = await approvalService.mdDecision(req.user!, req.params.id, req.body);
  res.status(200).json(application);
});

export const disburseController = catchAsync(async (req: Request, res: Response) => {
  const application = await approvalService.disburseApplication(req.user!, req.params.id, req.body);
  res.status(200).json(application);
});

export const resolveQueryController = catchAsync(async (req: Request, res: Response) => {
  const application = await approvalService.resolveQuery(req.user!, req.params.id, req.body.comment);
  res.status(200).json(application);
});

export const listApprovalsController = catchAsync(async (req: Request, res: Response) => {
  const approvals = await approvalService.listApprovals(req.user!, req.params.id);
  res.status(200).json(approvals);
});
