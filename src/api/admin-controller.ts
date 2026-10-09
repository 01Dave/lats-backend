import { Request, Response } from "express";
import { catchAsync } from "../middleware/catch-async";
import * as adminService from "../services/admin-service";

export const createUserController = catchAsync(async (req: Request, res: Response) => {
  const user = await adminService.createUser(req.body);
  res.status(201).json(user);
});

export const listUsersController = catchAsync(async (_req: Request, res: Response) => {
  const users = await adminService.listUsers();
  res.status(200).json(users);
});

export const getUserController = catchAsync(async (req: Request, res: Response) => {
  const user = await adminService.getUserById(req.params.id);
  res.status(200).json(user);
});

export const updateUserController = catchAsync(async (req: Request, res: Response) => {
  const user = await adminService.updateUser(req.user!, req.params.id, req.body);
  res.status(200).json(user);
});

export const resetPasswordController = catchAsync(async (req: Request, res: Response) => {
  const user = await adminService.resetPassword(req.params.id, req.body.password);
  res.status(200).json(user);
});
