import { Request, Response } from "express";
import { catchAsync } from "../middleware/catch-async";
import * as commentService from "../services/comment-service";

export const addCommentController = catchAsync(async (req: Request, res: Response) => {
  const comment = await commentService.addComment(req.user!, req.params.id, req.body.body);
  res.status(201).json(comment);
});

export const listCommentsController = catchAsync(async (req: Request, res: Response) => {
  const comments = await commentService.listComments(req.user!, req.params.id);
  res.status(200).json(comments);
});
