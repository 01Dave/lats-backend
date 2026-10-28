import { Response } from "express";
import { Request } from "express";
import { catchAsync } from "../middleware/catch-async";
import * as applicationService from "../services/application-service";
import * as reassignmentService from "../services/reassignment-service";

export const createApplicationController = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.createApplication(req.user!, req.body);
  res.status(201).json(application);
});

export const listApplicationsController = catchAsync(async (req: Request, res: Response) => {
  // req.query is already validated/defaulted by validateQuery(listApplicationsQuerySchema)
  // before this runs — page/limit are always present, status is
  // optional. Cast needed because Express types req.query as
  // ParsedQs (all-string) regardless of what validateQuery actually put there.
  const query = req.query as unknown as {
    status?: string;
    owner?: "me";
    page: number;
    limit: number;
  };
  const result = await applicationService.listApplications(req.user!, {
    status: query.status as applicationService.ListApplicationsFilters["status"],
    owner: query.owner,
    page: query.page,
    limit: query.limit,
  });
  res.status(200).json(result);
});

export const getApplicationController = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.getApplicationById(req.user!, req.params.id);
  res.status(200).json(application);
});

export const updateApplicationController = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.updateApplication(req.user!, req.params.id, req.body);
  res.status(200).json(application);
});

export const submitApplicationController = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.submitApplication(req.user!, req.params.id);
  res.status(200).json(application);
});

export const withdrawApplicationController = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.withdrawApplication(req.user!, req.params.id, req.body.comment);
  res.status(200).json(application);
});

export const reassignCaseController = catchAsync(async (req: Request, res: Response) => {
  const application = await reassignmentService.reassignCase(req.user!, req.params.id, req.body.assigneeId);
  res.status(200).json(application);
});

export const listAssignmentsController = catchAsync(async (req: Request, res: Response) => {
  const assignments = await reassignmentService.listAssignments(req.user!, req.params.id);
  res.status(200).json(assignments);
});
