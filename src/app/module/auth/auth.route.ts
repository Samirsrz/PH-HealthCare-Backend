import { NextFunction, Request, Response, Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { ForgotPasswordZodSchema, LoginZodSchema, PatientEmailVerifiedZodSchema, PatientRegistrationZodSchema, ResetPasswordZodSchema } from "./auth.validation";
import { catchAsync } from "../../utils/catchAsync";
import z from "zod";
import { validateRequest } from "../../middleware/validateRequest";

const router = Router();

router.post("/register",validateRequest(PatientRegistrationZodSchema), AuthController.registerPatient);
router.post("/login",validateRequest(LoginZodSchema), AuthController.loginUser);
router.get("/me",auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),AuthController.getMe);
router.post("/refresh-token", AuthController.refreshToken);

router.post("/verify-email",validateRequest(PatientEmailVerifiedZodSchema),AuthController.verifyPatientEmail)

router.post("/forgot-password",validateRequest(ForgotPasswordZodSchema), AuthController.forgotPassword);
router.post("/reset-password",validateRequest(ResetPasswordZodSchema) ,AuthController.resetPassword);

router.post("/google",AuthController.googleLogin)
export const AuthRoutes = router;
