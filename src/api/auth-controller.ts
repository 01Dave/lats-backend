import { Request, Response } from "express";
import { login, InvalidCredentialsError, AccountInactiveError } from "../services/auth-service";

export async function loginController(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  try {
    const result = await login(email, password);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
      return;
    }
    if (err instanceof AccountInactiveError) {
      res.status(423).json({ code: "ACCOUNT_INACTIVE", message: "Account is inactive" });
      return;
    }
    throw err;
  }
}

export function meController(req: Request, res: Response): void {
  res.status(200).json(req.user);
}
